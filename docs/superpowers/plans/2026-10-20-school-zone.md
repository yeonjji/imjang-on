# 아파트 상세 배정 초등학교(학구도) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학구도(초등학교 통학구역 SHP + 학교학구도연계 CSV)를 PostGIS에 적재하고, 아파트 상세 `NearbySubway` 위에 "배정 초등학교" 섹션을 렌더한다.

**Architecture:** 반기 수동 실행 적재 스크립트(`scripts/ingest/school-zone/`)가 zip/CSV를 파싱해 `SchoolZone`(폴리곤, 4326) + `SchoolZoneSchool`(학구-학교, 우리 `School` 매칭)을 트랜잭션 교체 적재한다. 화면은 렌더 시 `ST_Contains` 한 번으로 학구를 찾고, 순수 함수 `buildSchoolZoneView`가 표시 모델을 만든다.

**Tech Stack:** Next.js 서버 컴포넌트, Prisma + PostGIS(raw SQL), `shapefile`(SHP/DBF 파서), `fflate`(zip), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-20-school-zone-design.md` · UI 확정본: `docs/superpowers/mockups/2026-10-20-school-zone.html`

## Global Constraints

- 브랜치 `feat/school-zone`. main 직접 커밋 금지, 머지는 전체 확인 + 사용자 승인 후.
- 화면은 DB만 읽는다(외부 호출 없음). 섹션 데이터가 없으면 `null` 렌더.
- 이름 유사 매칭 금지. 학교 링크는 매칭이 확실할 때만(이름 + 시·도 교육청, 1곳이면 학구 10km 이내, 여러 곳이면 3km 이내 정확히 1곳).
- 문구: "배정됩니다" 같은 단정·학교 평가 금지. 공통 안내 "통학구역은 교육청이 조정할 수 있고 동·호수에 따라 다를 수 있습니다. 실제 배정 학교는 {교육지원청명}에 확인하세요." 출처·기준일·"직선거리는 임장ON 계산" 표시.
- 좌표 변환은 DB(`ST_Transform` 5186→4326). DBF는 EUC-KR, zip 내부 파일명 CP949(확장자로 고른다).
- 완료 전 `pnpm lint` 필수. UI 문구가 생기므로 e2e 실행.

## Review Focus

1. **중복 학구 ID**: SHP 레코드 7,123개에 ID 7,122개 — 같은 ID가 두 번 오면 PK 충돌 없이 폴리곤을 합쳐야 한다 (Task 3 테스트).
2. **광역 기본 학교를 못 찾는 학구**: 학구명 접두어가 학교명과 안 맞으면 전원을 기본 학교로(빈 기본 목록 금지) (Task 2 테스트).
3. **매칭 안 된 학교**: `schoolId`·거리 없이 이름만, 링크 없음 (Task 5·6 테스트).
4. **빈/잘린 다운로드**: 적재 결과가 이전의 90% 미만이면 롤백 (Task 3 테스트).
5. **학교명에 "(휴교)" 등 부가 표기**: 원문 그대로 표시, 광역 기본 학교 판정은 "초등학교" 뒤를 잘라 비교 (Task 2 테스트).

---

### Task 0: 의존성

- [ ] **Step 1:** `pnpm add shapefile@0.6.6 fflate@0.8.3 && pnpm add -D @types/shapefile@0.6.4`
- [ ] **Step 2:** `pnpm typecheck` → 통과
- [ ] **Step 3:** 커밋 `git add package.json pnpm-lock.yaml && git commit -m "chore(deps): 학구도 적재용 shapefile·fflate 추가"`

### Task 1: 스키마·마이그레이션

**Files:** Modify `prisma/schema.prisma` · Create `prisma/migrations/20261020000000_add_school_zone/migration.sql`

- [ ] **Step 1: schema.prisma (`model AptMaintenanceCostStat` 블록 뒤)**

```prisma
/// 초등학교 통학구역(학구도). 반기 배포(3·9월) 파일을 통째로 교체 적재한다. geom은 raw SQL로만 쓴다.
model SchoolZone {
  hakgudoId String   @id @db.VarChar(19)
  name      String   @db.VarChar(120)
  /// 'general' | 'shared' | 'shared_oneway' | 'wide' (학구명에서 분류)
  kind      String   @db.VarChar(16)
  /// 교육지원청명. 확인 안내 문구에 쓴다.
  eduName   String?  @db.VarChar(60)
  baseDate  DateTime @db.Date
  geom      Unsupported("geometry(MultiPolygon,4326)")
  schools   SchoolZoneSchool[]
}

model SchoolZoneSchool {
  hakgudoId  String  @db.VarChar(19)
  schId      String  @db.VarChar(19)
  /// 원문 학교명("(휴교)" 등 부가 표기 포함)
  schoolName String  @db.VarChar(60)
  /// 시·도 교육청명(별칭 정규화 후). School.eduOffice와 매칭한다.
  eduOffice  String  @db.VarChar(60)
  /// 우리 School 매칭 결과. 확실할 때만 채운다(링크·거리용).
  schoolId   BigInt?
  /// 광역통학구역의 기본 학교. 일반·공동은 모두 true.
  isPrimary  Boolean
  zone       SchoolZone @relation(fields: [hakgudoId], references: [hakgudoId], onDelete: Cascade)

  @@id([hakgudoId, schId])
}
```

- [ ] **Step 2: migration.sql**

```sql
-- CreateTable
CREATE TABLE "SchoolZone" (
    "hakgudoId" VARCHAR(19) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "eduName" VARCHAR(60),
    "baseDate" DATE NOT NULL,
    "geom" geometry(MultiPolygon,4326) NOT NULL,
    CONSTRAINT "SchoolZone_pkey" PRIMARY KEY ("hakgudoId")
);

-- CreateTable
CREATE TABLE "SchoolZoneSchool" (
    "hakgudoId" VARCHAR(19) NOT NULL,
    "schId" VARCHAR(19) NOT NULL,
    "schoolName" VARCHAR(60) NOT NULL,
    "eduOffice" VARCHAR(60) NOT NULL,
    "schoolId" BIGINT,
    "isPrimary" BOOLEAN NOT NULL,
    CONSTRAINT "SchoolZoneSchool_pkey" PRIMARY KEY ("hakgudoId","schId")
);

-- 점 포함 조회용 공간 인덱스(Prisma 스키마로 표현 불가 — 다른 location 인덱스와 같은 방식)
CREATE INDEX "SchoolZone_geom_idx" ON "SchoolZone" USING GIST ("geom");

-- AddForeignKey
ALTER TABLE "SchoolZoneSchool" ADD CONSTRAINT "SchoolZoneSchool_hakgudoId_fkey" FOREIGN KEY ("hakgudoId") REFERENCES "SchoolZone"("hakgudoId") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3:** `pnpm test:db:migrate && pnpm prisma generate` → 새 마이그레이션 적용. `prisma migrate diff`(datasource↔schema)에서 SchoolZone 관련 차이는 GiST 인덱스 1건뿐이어야 한다(기존 PostGIS 인덱스와 같은 종류의 의도된 드리프트).
- [ ] **Step 4:** 커밋(새 마이그레이션 폴더만) `feat(db): 학구도 테이블 SchoolZone·SchoolZoneSchool 추가`

### Task 2: 파싱 (순수)

**Files:** Create `scripts/ingest/school-zone/parse.ts` · Test `tests/ingest/school-zone/parse.test.ts` · Fixtures `tests/ingest/fixtures/school-zone/{zone.zip,link.csv}`(3개 학구 — 일반 '테스트초통학구역'·공동 '가람초나래초공동통학구역'·광역 '가람초광역통학구역', EPSG:5186, EUC-KR DBF, CP949 파일명 / CSV CP949 6행 중 초등 5행, 먼산초는 '광주광역시교육청')

**Produces:** `type ZoneKind`, `interface ZoneInput { hakgudoId; name; kind; eduName: string|null; baseDate: string; geometry: unknown }`, `interface LinkInput { hakgudoId; schId; schoolName; eduOffice }`, `classifyZoneKind(name)`, `normalizeEduOffice(name)`, `isPrimarySchool(zoneName, kind, schoolName)`, `markPrimaries(zones, links): (LinkInput & { isPrimary: boolean })[]`, `parseLinkCsv(bytes: Uint8Array): LinkInput[]`, `readZoneZip(bytes: Uint8Array): Promise<ZoneInput[]>`

- [ ] **Step 1: 실패 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyZoneKind, normalizeEduOffice, isPrimarySchool, markPrimaries, parseLinkCsv, readZoneZip,
} from '@/scripts/ingest/school-zone/parse';

const FX = 'tests/ingest/fixtures/school-zone/';

describe('classifyZoneKind', () => {
  it('학구명으로 유형을 나눈다', () => {
    expect(classifyZoneKind('서울대청초통학구역')).toBe('general');
    expect(classifyZoneKind('가남초가양초공동통학구역')).toBe('shared');
    expect(classifyZoneKind('구곡초교동초공통통학구역')).toBe('shared'); // 원문 오타
    expect(classifyZoneKind('대전신흥초세천초공동(일방)통학구역')).toBe('shared_oneway');
    expect(classifyZoneKind('가남초광역통학구역')).toBe('wide');
  });
});

describe('normalizeEduOffice', () => {
  it('통합 전 광주·전남 교육청명을 현재 이름으로', () => {
    expect(normalizeEduOffice('광주광역시교육청')).toBe('전남광주통합특별시교육청(광주)');
    expect(normalizeEduOffice('전라남도교육청')).toBe('전남광주통합특별시교육청(전남)');
    expect(normalizeEduOffice('서울특별시교육청')).toBe('서울특별시교육청');
  });
});

describe('기본 학교', () => {
  it('광역은 학구명 접두어로 기본 학교를 고른다("(휴교)" 등 부가 표기 무시)', () => {
    expect(isPrimarySchool('가남초광역통학구역', 'wide', '가남초등학교')).toBe(true);
    expect(isPrimarySchool('가남초광역통학구역', 'wide', '물금초등학교')).toBe(false);
    expect(isPrimarySchool('동방초광역통학구역', 'wide', '동방초등학교(휴교)')).toBe(true);
    expect(isPrimarySchool('가남초가양초공동통학구역', 'shared', '가양초등학교')).toBe(true);
  });
  it('광역인데 기본 학교를 못 찾으면 전원을 기본으로', () => {
    const zones = [{ hakgudoId: 'Z1', name: '이상한광역통학구역', kind: 'wide' as const, eduName: null, baseDate: '2025-09-22', geometry: null }];
    const links = [
      { hakgudoId: 'Z1', schId: 'B1', schoolName: '가초등학교', eduOffice: 'x' },
      { hakgudoId: 'Z1', schId: 'B2', schoolName: '나초등학교', eduOffice: 'x' },
    ];
    expect(markPrimaries(zones, links).every((l) => l.isPrimary)).toBe(true);
  });
});

describe('파일 파싱', () => {
  it('zip(CP949 파일명)에서 SHP·DBF(EUC-KR)를 읽는다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    expect(zones.map((z) => [z.hakgudoId, z.name, z.kind])).toEqual([
      ['Z000000001', '테스트초통학구역', 'general'],
      ['Z000000002', '가람초나래초공동통학구역', 'shared'],
      ['Z000000003', '가람초광역통학구역', 'wide'],
    ]);
    expect(zones[0].eduName).toBe('서울특별시강남서초교육지원청');
    expect(zones[0].baseDate).toBe('2025-09-22');
    expect((zones[0].geometry as { type: string }).type).toBe('Polygon');
  });
  it('CSV(CP949)에서 초등학교만, 교육청명은 정규화', () => {
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    expect(links).toHaveLength(5);
    expect(links.find((l) => l.schoolName === '먼산초등학교')!.eduOffice).toBe('전남광주통합특별시교육청(광주)');
  });
});
```

Run `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/school-zone/parse.test.ts` → FAIL(module not found)

- [ ] **Step 2: parse.ts**

```ts
/**
 * 학구도 파일 파싱. 한국지방교육행정연구재단 배포본(반기, 3·9월).
 * - SHP: EPSG:5186, DBF EUC-KR, zip 내부 파일명 CP949 → 이름 대신 확장자로 고른다.
 * - CSV: CP949(UTF-8이면 그대로).
 * 좌표 변환은 하지 않는다(적재 시 DB의 ST_Transform).
 */
import { unzipSync } from 'fflate';
import { open } from 'shapefile';

export type ZoneKind = 'general' | 'shared' | 'shared_oneway' | 'wide';

export interface ZoneInput {
  hakgudoId: string;
  name: string;
  kind: ZoneKind;
  eduName: string | null;
  baseDate: string;
  geometry: unknown;
}

export interface LinkInput {
  hakgudoId: string;
  schId: string;
  schoolName: string;
  eduOffice: string;
}

export function classifyZoneKind(name: string): ZoneKind {
  if (name.includes('광역')) return 'wide';
  if (name.includes('일방')) return 'shared_oneway';
  if (name.includes('공동') || name.includes('공통')) return 'shared';
  return 'general';
}

/** 2026-07 광주·전남 통합으로 School.eduOffice가 새 이름이다(학구도는 옛 이름). */
const OFFICE_ALIAS: Record<string, string> = {
  광주광역시교육청: '전남광주통합특별시교육청(광주)',
  전라남도교육청: '전남광주통합특별시교육청(전남)',
};
export function normalizeEduOffice(name: string): string {
  return OFFICE_ALIAS[name] ?? name;
}

/** 광역통학구역의 기본 학교 = 학구명이 학교 약칭('가남초')으로 시작. 그 외 유형은 모두 기본. */
export function isPrimarySchool(zoneName: string, kind: ZoneKind, schoolName: string): boolean {
  if (kind !== 'wide') return true;
  return zoneName.startsWith(schoolName.replace(/초등학교.*$/, '초'));
}

export function markPrimaries(zones: ZoneInput[], links: LinkInput[]): (LinkInput & { isPrimary: boolean })[] {
  const zoneById = new Map(zones.map((z) => [z.hakgudoId, z]));
  const out = links.map((l) => {
    const z = zoneById.get(l.hakgudoId);
    return { ...l, isPrimary: z ? isPrimarySchool(z.name, z.kind, l.schoolName) : true };
  });
  const byZone = new Map<string, (LinkInput & { isPrimary: boolean })[]>();
  for (const l of out) byZone.set(l.hakgudoId, [...(byZone.get(l.hakgudoId) ?? []), l]);
  // 기본 학교를 못 찾은 학구는 전원을 기본으로 — 빈 기본 목록은 화면이 비게 만든다.
  for (const ls of byZone.values()) if (!ls.some((l) => l.isPrimary)) for (const l of ls) l.isPrimary = true;
  return out;
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

export function parseLinkCsv(bytes: Uint8Array): LinkInput[] {
  const [header, ...lines] = decodeText(bytes).split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = header.split(',').map((c) => c.trim());
  const col = (n: string) => {
    const i = cols.indexOf(n);
    if (i < 0) throw new Error(`link csv: '${n}' 열이 없다`);
    return i;
  };
  const [iZone, iSch, iName, iKind, iOffice] = ['학구ID', '학교ID', '학교명', '학교급구분', '시도교육청명'].map(col);
  return lines
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c[iKind] === '초등학교')
    .map((c) => ({ hakgudoId: c[iZone], schId: c[iSch], schoolName: c[iName], eduOffice: normalizeEduOffice(c[iOffice]) }));
}

const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.slice().buffer;

export async function readZoneZip(bytes: Uint8Array): Promise<ZoneInput[]> {
  const files = unzipSync(bytes);
  const pick = (ext: string) => {
    const key = Object.keys(files).find((n) => n.toLowerCase().endsWith(ext));
    if (!key) throw new Error(`zone zip: ${ext} 파일이 없다`);
    return files[key];
  };
  const source = await open(toArrayBuffer(pick('.shp')), toArrayBuffer(pick('.dbf')), { encoding: 'euc-kr' });
  const zones: ZoneInput[] = [];
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const p = r.value.properties as Record<string, unknown>;
    const name = String(p.HAKGUDO_NM ?? '').trim();
    const edu = String(p.EDU_NM ?? '').trim();
    zones.push({
      hakgudoId: String(p.HAKGUDO_ID ?? '').trim(),
      name,
      kind: classifyZoneKind(name),
      eduName: edu || null,
      baseDate: String(p.BASE_DT ?? '').trim(),
      geometry: r.value.geometry,
    });
  }
  return zones;
}
```

- [ ] **Step 3:** 테스트 통과 확인 → 커밋 `feat(ingest): 학구도 SHP·CSV 파싱` (fixtures 포함)

### Task 3: 적재 (DB)

**Files:** Create `scripts/ingest/school-zone/load.ts` · Test `tests/integration/school-zone-load.test.ts`

**Consumes:** Task 2. **Produces:** `replaceSchoolZones(zones, links, opts?: { srid?: number }): Promise<{ zones: number; links: number; matched: number }>`, `MIN_KEEP_RATIO`

- [ ] **Step 1: 실패 테스트**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { readZoneZip, parseLinkCsv } from '@/scripts/ingest/school-zone/parse';
import { replaceSchoolZones } from '@/scripts/ingest/school-zone/load';

const FX = 'tests/ingest/fixtures/school-zone/';
const PFX = 'UT-SZ-';

async function school(name: string, eduOffice: string, lng: number, lat: number) {
  const s = await prisma.school.create({ data: { sourceId: `${PFX}${name}-${lng}`, name, address: 'x', schoolKind: '초등학교', eduOffice, sigunguCode: '11650' } });
  await prisma.$executeRaw`UPDATE "School" SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography WHERE id = ${s.id}`;
  return s.id;
}
let near: bigint; let gaNear: bigint;

beforeAll(async () => {
  await prisma.school.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  near = await school('테스트초등학교', '서울특별시교육청', 127.026, 37.4966);      // 학구1 안
  gaNear = await school('가람초등학교', '서울특별시교육청', 127.051, 37.5005);      // 학구2 옆
  await school('가람초등학교', '서울특별시교육청', 127.30, 37.60);                  // 같은 이름, 20km+ 밖
});
afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "SchoolZone"`;
  await prisma.school.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('replaceSchoolZones', () => {
  it('5186 폴리곤을 4326으로 적재하고 학교를 확실할 때만 매칭한다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    const r = await replaceSchoolZones(zones, links);
    expect(r).toMatchObject({ zones: 3, links: 5 });
    const [hit] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "hakgudoId" AS id FROM "SchoolZone" WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326))`;
    expect(hit.id).toBe('Z000000001');
    const rows = await prisma.schoolZoneSchool.findMany({ orderBy: [{ hakgudoId: 'asc' }, { schId: 'asc' }] });
    const by = (z: string, n: string) => rows.find((x) => x.hakgudoId === z && x.schoolName === n)!;
    expect(by('Z000000001', '테스트초등학교').schoolId).toBe(near);
    expect(by('Z000000002', '가람초등학교').schoolId).toBe(gaNear);      // 같은 이름 2곳 → 3km 이내 1곳
    expect(by('Z000000002', '나래초등학교').schoolId).toBeNull();        // 우리 DB에 없음
    expect(by('Z000000003', '먼산초등학교').isPrimary).toBe(false);      // 광역 비기본
    expect(by('Z000000003', '가람초등학교').isPrimary).toBe(true);
  });

  it('같은 학구 ID가 두 번 오면 폴리곤을 합친다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const dup = [...zones, { ...zones[1], hakgudoId: zones[0].hakgudoId }];
    const r = await replaceSchoolZones(dup, []);
    expect(r.zones).toBe(3);
    const [n] = await prisma.$queryRaw<{ n: number }[]>`SELECT ST_NumGeometries(geom)::int AS n FROM "SchoolZone" WHERE "hakgudoId" = 'Z000000001'`;
    expect(n.n).toBe(2);
  });

  it('이전의 90% 미만이면 거부하고 기존 데이터를 지킨다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    await replaceSchoolZones(zones, []);
    await expect(replaceSchoolZones(zones.slice(0, 1), [])).rejects.toThrow(/90%/);
    expect(await prisma.schoolZone.count()).toBe(3);
  });
});
```

Run `pnpm exec dotenv -e .env.test -- vitest run tests/integration/school-zone-load.test.ts --no-file-parallelism` → FAIL

- [ ] **Step 2: load.ts**

```ts
/**
 * 학구도 교체 적재. 두 테이블을 한 트랜잭션에서 지우고 다시 넣는다.
 * 결과가 이전의 90% 미만이면 거부(빈·잘린 다운로드 사고 방지).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { markPrimaries, type LinkInput, type ZoneInput } from './parse';

export const MIN_KEEP_RATIO = 0.9;

/**
 * 학교 매칭: 이름 + 시·도 교육청. 후보가 1곳이면 학구에서 10km 이내, 여러 곳이면 3km 이내가
 * 정확히 1곳일 때만 채택한다. 이름 유사 매칭은 하지 않는다(실측: '영산포초→산포초' 오매칭).
 */
async function matchSchools(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    UPDATE "SchoolZoneSchool" t SET "schoolId" = m.id
    FROM (
      SELECT "hakgudoId", "schId", MIN(id) AS id
      FROM (
        SELECT s."hakgudoId", s."schId", sc.id,
               ST_Distance(sc.location, z.geom::geography) AS d,
               COUNT(*) OVER (PARTITION BY s."hakgudoId", s."schId") AS n
        FROM "SchoolZoneSchool" s
        JOIN "SchoolZone" z ON z."hakgudoId" = s."hakgudoId"
        JOIN "School" sc ON sc.name = s."schoolName" AND sc."eduOffice" = s."eduOffice" AND sc.location IS NOT NULL
      ) c
      WHERE (n = 1 AND d < 10000) OR (n > 1 AND d < 3000)
      GROUP BY "hakgudoId", "schId"
      HAVING COUNT(*) = 1
    ) m
    WHERE t."hakgudoId" = m."hakgudoId" AND t."schId" = m."schId"`;
}

export async function replaceSchoolZones(
  zones: ZoneInput[],
  links: LinkInput[],
  opts: { srid?: number } = {},
): Promise<{ zones: number; links: number; matched: number }> {
  const srid = opts.srid ?? 5186;
  const ids = new Set(zones.map((z) => z.hakgudoId));
  const seen = new Set<string>();
  const rows = markPrimaries(zones, links).filter((l) => {
    const k = `${l.hakgudoId}|${l.schId}`;
    if (!ids.has(l.hakgudoId) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return prisma.$transaction(
    async (tx) => {
      const prev = await tx.schoolZone.count();
      if (prev > 0 && ids.size < prev * MIN_KEEP_RATIO) {
        throw new Error(`학구 ${ids.size}개 < 이전 ${prev}개의 90% — 적재 거부`);
      }
      await tx.$executeRaw`DELETE FROM "SchoolZone"`; // SchoolZoneSchool은 CASCADE
      for (const z of zones) {
        await tx.$executeRaw`
          INSERT INTO "SchoolZone" ("hakgudoId", name, kind, "eduName", "baseDate", geom)
          VALUES (${z.hakgudoId}, ${z.name}, ${z.kind}, ${z.eduName}, ${z.baseDate}::date,
            ST_Multi(ST_CollectionExtract(ST_MakeValid(
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(z.geometry)}), ${srid}::int), 4326)
            ), 3)))
          ON CONFLICT ("hakgudoId") DO UPDATE
            SET geom = ST_Multi(ST_CollectionExtract(ST_Union("SchoolZone".geom, EXCLUDED.geom), 3))`;
      }
      if (rows.length > 0) {
        await tx.schoolZoneSchool.createMany({
          data: rows.map((l) => ({ hakgudoId: l.hakgudoId, schId: l.schId, schoolName: l.schoolName, eduOffice: l.eduOffice, isPrimary: l.isPrimary })),
        });
      }
      const matched = await matchSchools(tx);
      return { zones: await tx.schoolZone.count(), links: rows.length, matched };
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
}
```

- [ ] **Step 3:** 통과 확인 → 커밋 `feat(ingest): 학구도 교체 적재와 학교 매칭`

### Task 4: 다운로드·실행기

**Files:** Create `scripts/ingest/school-zone/download.ts`, `scripts/ingest/school-zone/runner.ts` · Modify `package.json`(`"ingest:school-zone": "dotenv -e .env.local -- tsx scripts/ingest/school-zone/runner.ts"`)

- [ ] **Step 1: download.ts**

```ts
/** data.go.kr 파일데이터 다운로드(로그인 불필요): 파일 ID 조회(POST) → 파일 GET. 2026-10-20 실측 경로. */
const BASE = 'https://www.data.go.kr';
const UA = 'imjang-on/1.0 (+https://imjangon.co.kr)';

export const SCHOOL_ZONE_DATASETS = {
  zone: { publicDataPk: '15099520', detailPk: 'uddi:fa9f0432-91a3-4cfa-99ea-beb854b7a487' },
  link: { publicDataPk: '15099521', detailPk: 'uddi:a06c5780-ca78-482f-995e-f088a57c3b0b' },
} as const;

export async function downloadFileData(ds: { publicDataPk: string; detailPk: string }): Promise<Uint8Array> {
  const referer = `${BASE}/data/${ds.publicDataPk}/fileData.do`;
  const res = await fetch(`${BASE}/tcs/dss/selectFileDataDownload.do`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Referer: referer, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ publicDataDetailPk: ds.detailPk, publicDataPk: ds.publicDataPk, atchFileId: '', fileDetailSn: '1', publicDataTyCode: 'PR0051' }),
  });
  const j = (await res.json()) as { status?: boolean; atchFileId?: string; fileDetailSn?: string | number };
  if (!j.status || !j.atchFileId) throw new Error(`파일 ID 조회 실패: ${ds.publicDataPk}`);
  const f = await fetch(`${BASE}/cmm/cmm/fileDownload.do?atchFileId=${j.atchFileId}&fileDetailSn=${j.fileDetailSn ?? 1}&insertDataPrcus=N`, {
    headers: { 'User-Agent': UA, Referer: referer },
  });
  if (!f.ok) throw new Error(`다운로드 실패 HTTP ${f.status}: ${ds.publicDataPk}`);
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf.length < 1000) throw new Error(`다운로드 파일이 너무 작다(${buf.length}B): ${ds.publicDataPk}`);
  return buf;
}
```

- [ ] **Step 2: runner.ts**

```ts
/**
 * 학구도 적재(반기 수동). 3·9월 배포 후 실행한다.
 *   pnpm ingest:school-zone                      # data.go.kr에서 직접 받음
 *   pnpm ingest:school-zone --zone-zip=… --link-csv=…   # 받아 둔 파일로
 * 화면은 ISR 주기로 반영되므로 revalidate를 호출하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { SCHOOL_ZONE_DATASETS, downloadFileData } from './download';
import { readZoneZip, parseLinkCsv } from './parse';
import { replaceSchoolZones } from './load';

export const SCHOOL_ZONE_SOURCE = 'school-zone';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({ data: { source: SCHOOL_ZONE_SOURCE, targetKey: 'loading', status: 'RUNNING' } });
  try {
    const zonePath = arg('zone-zip');
    const linkPath = arg('link-csv');
    const zoneBytes = zonePath ? new Uint8Array(readFileSync(zonePath)) : await downloadFileData(SCHOOL_ZONE_DATASETS.zone);
    const linkBytes = linkPath ? new Uint8Array(readFileSync(linkPath)) : await downloadFileData(SCHOOL_ZONE_DATASETS.link);
    const zones = await readZoneZip(zoneBytes);
    const links = parseLinkCsv(linkBytes);
    const baseDate = zones[0]?.baseDate ?? 'unknown';
    logger.info({ zones: zones.length, links: links.length, baseDate }, 'school-zone parsed');
    const r = await replaceSchoolZones(zones, links);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', targetKey: baseDate, rowsUpserted: r.zones, finishedAt: new Date() } });
    await notify('info', `school-zone ${baseDate} 적재 완료`, r);
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'school-zone failed');
    await notify('error', 'school-zone failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('school-zone/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'school-zone runner fatal');
    process.exit(1);
  });
}
```

- [ ] **Step 3: 실데이터 로컬 적재** — 로컬 DB(.env.local=docker 5433)에 실제 파일로: `DISCORD_WEBHOOK_URL= pnpm ingest:school-zone` (다운로드 경로 실검증). Expected: 학구 7,122 · 연계 ~11,4xx · IngestionRun OK. 로컬 School이 비어 있으면 matched=0이 정상. 소요 시간 기록.
- [ ] **Step 4:** 커밋 `feat(ingest): 학구도 다운로드·실행기`

### Task 5: 표시 모델·조회

**Files:** Create `lib/insights/school-zone.ts`, `lib/school-zone-query.ts` · Test `tests/lib/school-zone.test.ts`, `tests/integration/school-zone-query.test.ts`

**Produces:** `type SchoolZoneRow`, `type ZoneSchool { name; href: string|null; distanceLabel: string|null }`, `type SchoolZoneView { zoneName; kind; kindLabel: string|null; eduName: string|null; baseDateLabel: string; primary: ZoneSchool[]; others: ZoneSchool[] }`, `formatDistance(m)`, `buildSchoolZoneView(rows)`, `getSchoolZoneView(propertyId)`

- [ ] **Step 1: 실패 테스트 (`tests/lib/school-zone.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { buildSchoolZoneView, formatDistance, type SchoolZoneRow } from '@/lib/insights/school-zone';

const base: Omit<SchoolZoneRow, 'schoolName' | 'isPrimary' | 'schoolId' | 'schoolSigunguCode' | 'distanceM'> = {
  hakgudoId: 'Z1', zoneName: '가남초광역통학구역', kind: 'wide', eduName: '경상남도양산교육지원청', baseDate: new Date('2025-09-22T00:00:00Z'),
};
const row = (schoolName: string, isPrimary: boolean, distanceM: number | null, schoolId: bigint | null = 1n): SchoolZoneRow =>
  ({ ...base, schoolName, isPrimary, distanceM, schoolId, schoolSigunguCode: schoolId ? '48330' : null });

describe('formatDistance', () => {
  it('1km 미만은 10m 단위, 이상은 소수 첫째 km', () => {
    expect(formatDistance(285)).toBe('약 290m');
    expect(formatDistance(4)).toBe('약 10m');
    expect(formatDistance(1358)).toBe('약 1.4km');
  });
});

describe('buildSchoolZoneView', () => {
  it('행이 없으면 null', () => expect(buildSchoolZoneView([])).toBeNull());
  it('광역: 기본 학교와 함께 지정된 학교를 나누고 거리순', () => {
    const v = buildSchoolZoneView([row('양산초등학교', false, 5769), row('가남초등학교', true, 575), row('물금초등학교', false, 1358)])!;
    expect(v.kindLabel).toBe('광역통학구역');
    expect(v.primary.map((s) => s.name)).toEqual(['가남초등학교']);
    expect(v.others.map((s) => s.name)).toEqual(['물금초등학교', '양산초등학교']);
    expect(v.primary[0].href).toBe('/school/48330/1');
    expect(v.baseDateLabel).toBe('2025-09-22');
  });
  it('매칭 안 된 학교는 링크·거리 없음, 목록 끝', () => {
    const v = buildSchoolZoneView([
      { ...row('나래초등학교', true, null, null), kind: 'shared', zoneName: '가람초나래초공동통학구역' },
      { ...row('가람초등학교', true, 300), kind: 'shared', zoneName: '가람초나래초공동통학구역' },
    ])!;
    expect(v.kindLabel).toBe('공동통학구역');
    expect(v.primary.map((s) => s.name)).toEqual(['가람초등학교', '나래초등학교']);
    expect(v.primary[1]).toEqual({ name: '나래초등학교', href: null, distanceLabel: null });
  });
  it('일반은 배지 없음, 공동(일방) 라벨', () => {
    expect(buildSchoolZoneView([{ ...row('서울대청초등학교', true, 285), kind: 'general' }])!.kindLabel).toBeNull();
    expect(buildSchoolZoneView([{ ...row('a초등학교', true, 1), kind: 'shared_oneway' }])!.kindLabel).toBe('공동(일방)통학구역');
  });
});
```

- [ ] **Step 2: `lib/insights/school-zone.ts`**

```ts
/** 배정 초등학교 섹션 표시 모델(순수). 단정·평가 문구는 컴포넌트에도 두지 않는다. */
export type ZoneKind = 'general' | 'shared' | 'shared_oneway' | 'wide';

export interface SchoolZoneRow {
  hakgudoId: string;
  zoneName: string;
  kind: string;
  eduName: string | null;
  baseDate: Date;
  schoolName: string;
  isPrimary: boolean;
  schoolId: bigint | null;
  schoolSigunguCode: string | null;
  distanceM: number | null;
}

export interface ZoneSchool {
  name: string;
  href: string | null;
  distanceLabel: string | null;
}

export interface SchoolZoneView {
  zoneName: string;
  kind: ZoneKind;
  kindLabel: string | null;
  eduName: string | null;
  baseDateLabel: string;
  primary: ZoneSchool[];
  others: ZoneSchool[];
}

const KIND_LABEL: Record<ZoneKind, string | null> = {
  general: null,
  shared: '공동통학구역',
  shared_oneway: '공동(일방)통학구역',
  wide: '광역통학구역',
};

export function formatDistance(m: number): string {
  return m < 1000 ? `약 ${Math.max(10, Math.round(m / 10) * 10)}m` : `약 ${(m / 1000).toFixed(1)}km`;
}

const asKind = (k: string): ZoneKind => (k in KIND_LABEL ? (k as ZoneKind) : 'general');

export function buildSchoolZoneView(rows: SchoolZoneRow[]): SchoolZoneView | null {
  if (rows.length === 0) return null;
  // 학구가 둘 이상 잡히면(실측 0건) ID 순 첫 학구만 쓴다.
  const zoneId = [...new Set(rows.map((r) => r.hakgudoId))].sort()[0];
  const zr = rows.filter((r) => r.hakgudoId === zoneId);
  const z = zr[0];
  const toSchool = (r: SchoolZoneRow): ZoneSchool => ({
    name: r.schoolName,
    href: r.schoolId !== null && r.schoolSigunguCode ? `/school/${r.schoolSigunguCode}/${r.schoolId}` : null,
    distanceLabel: r.distanceM !== null ? formatDistance(r.distanceM) : null,
  });
  const order = (a: SchoolZoneRow, b: SchoolZoneRow) =>
    (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.schoolName.localeCompare(b.schoolName, 'ko');
  const kind = asKind(z.kind);
  return {
    zoneName: z.zoneName,
    kind,
    kindLabel: KIND_LABEL[kind],
    eduName: z.eduName,
    baseDateLabel: z.baseDate.toISOString().slice(0, 10),
    primary: zr.filter((r) => r.isPrimary).sort(order).map(toSchool),
    others: zr.filter((r) => !r.isPrimary).sort(order).map(toSchool),
  };
}
```

- [ ] **Step 3: `lib/school-zone-query.ts`**

```ts
import { prisma } from '@/lib/db';
import { buildSchoolZoneView, type SchoolZoneRow, type SchoolZoneView } from '@/lib/insights/school-zone';

/** 아파트 대표 좌표가 포함된 학구와 그 학교들. 좌표·학구가 없으면 null. GiST 인덱스 1회 조회. */
export async function getSchoolZoneView(propertyId: bigint): Promise<SchoolZoneView | null> {
  const rows = await prisma.$queryRaw<(Omit<SchoolZoneRow, 'distanceM'> & { distanceM: number | string | null })[]>`
    SELECT z."hakgudoId", z.name AS "zoneName", z.kind, z."eduName", z."baseDate",
           s."schoolName", s."isPrimary", s."schoolId", sc."sigunguCode" AS "schoolSigunguCode",
           CASE WHEN sc.location IS NOT NULL THEN ST_Distance(sc.location, p.location) END AS "distanceM"
    FROM "Property" p
    JOIN "SchoolZone" z ON ST_Contains(z.geom, p.location::geometry)
    JOIN "SchoolZoneSchool" s ON s."hakgudoId" = z."hakgudoId"
    LEFT JOIN "School" sc ON sc.id = s."schoolId"
    WHERE p.id = ${propertyId} AND p.location IS NOT NULL`;
  return buildSchoolZoneView(rows.map((r) => ({ ...r, distanceM: r.distanceM === null ? null : Number(r.distanceM) })));
}
```

- [ ] **Step 4: 통합 테스트 (`tests/integration/school-zone-query.test.ts`)** — Property 2개(학구 안 127.026/37.4965, 밖 128.0/36.0)·4326 정사각형 학구 1개(raw INSERT `ST_Multi(ST_MakeEnvelope(127.024, 37.4945, 127.028, 37.4985, 4326))`)·학교 1곳 매칭(`schoolId` 직접 지정)을 시드 → 안: `primary[0]`에 href·거리, 밖: null. 실패 먼저 확인 후 통과.
- [ ] **Step 5:** 커밋 `feat(apt): 배정 초등학교 표시 모델과 조회`

### Task 6: 섹션 컴포넌트 + 출처

**Files:** Create `app/(public)/apt/[id]/_components/school-zone-section.tsx` · Modify `lib/data-sources.ts`(`'kedi-school-zone'`: provider '재단법인 한국지방교육행정연구재단', dataset '학구도(초등학교 통학구역)', url 'https://www.data.go.kr/data/15099520/fileData.do', category '교육·보육') · Test `tests/components/school-zone-section-ssr.test.ts`

- [ ] **Step 1: 실패 SSR 테스트** — 확인 항목: null → ''; 일반: '배정 초등학교', '단지 대표 위치 기준 통학구역', 학교명, '직선거리 약 290m', `href="/school/…"`, 공통 안내('동·호수에 따라 다를 수 있습니다', 교육지원청명), '기준일 2025-09-22', '임장ON 계산'; 공동: 배지 '공동통학구역'·'여러 학교가 함께 지정된 구역입니다'; 광역: '광역통학구역으로 함께 지정된 학교'; 매칭 없는 학교는 `<a` 없이 이름; 금지어 '배정됩니다'·'우수'·'좋은' 미포함.
- [ ] **Step 2: 컴포넌트** — 시안 구조 그대로(Card · head(h2 '배정 초등학교' + 기준일) · label · 단일 기본 학교면 primary 카드(링크 있으면 `<a>`), 기본 학교가 여럿이면 배지 + 안내문 + 목록 · 광역이면 others 목록 · notice(교육지원청명 없으면 "관할 교육지원청") · foot(출처·학구명·임장ON 계산) + `SourceCaption ids={['kedi-school-zone']}`). 색은 CSS 변수, 본문 14px 이상.
- [ ] **Step 3:** 통과 + `tests/lib/data-sources.test.ts` 통과 → 커밋 `feat(apt): 배정 초등학교 섹션과 출처`

### Task 7: 페이지·사이드바

- [ ] `page.tsx`: import 2개, `const schoolZone = await safe(getSchoolZoneView(propId), null, 'getSchoolZoneView');`(maintenance 조회 아래), `<NearbySubway data={subway} />` 바로 위에 `<SchoolZoneSection id="school-zone" view={schoolZone} />`, DetailSidebar에 `showSchoolZone={schoolZone !== null}`
- [ ] `detail-sidebar.tsx`: `{ href: '#school-zone', label: '배정 초등학교', needsSchoolZone: true }`를 `'#poi'` 앞에, prop `showSchoolZone`(기본 false)과 필터 조건 추가
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` → 커밋 `feat(apt): 상세 페이지에 배정 초등학교 섹션 배치`

### Task 8: e2e

- [ ] `seed-e2e.ts` main 시작부에 `await prisma.$executeRaw\`DELETE FROM "SchoolZone" WHERE "hakgudoId" = 'E2E-Z1'\``; 래미안서초 location UPDATE 다음에 학구 INSERT(`ST_Multi(ST_MakeEnvelope(127.024, 37.4945, 127.028, 37.4985, 4326))`, kind 'general', eduName '서울특별시강남서초교육지원청', baseDate '2025-09-22') + `SchoolZoneSchool`(schoolName 'E2E 거마초등학교', eduOffice '서울특별시교육청', isPrimary true, schoolId = E2E_SCH_0001의 id)
- [ ] `apt-detail.spec.ts`에 테스트: `#school-zone` 보임, heading '배정 초등학교', 'E2E 거마초등학교', '동·호수에 따라 다를 수 있습니다', 사이드바 링크 '배정 초등학교'
- [ ] 실패 먼저(시드 전) → 시드 후 통과 → 커밋 `test(e2e): 아파트 상세 배정 초등학교 섹션`

### Task 9: 머지 전 확인

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm build`, e2e apt-detail
- [ ] 최종 브랜치 리뷰(Opus) → Critical/Important 수정(실패 테스트 먼저)
- [ ] PR 생성, 본문에 **배포 후 할 일**: 박스에서 `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm tsx scripts/ingest/school-zone/runner.ts` 1회 → IngestionRun OK·학구 7,122·매칭 수 확인 → 일반·공동(일방)·광역 단지 페이지 확인(ISR 24h)
