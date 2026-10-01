# 생활시설 상세 보강 PR 2 — 공원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국도시공원정보표준데이터에서 버리던 7개 필드를 저장하고, 공원 상세(`/urban/park/[id]`)에 "공원 시설" 카드, 정보 행(지정 고시일·관리기관·전화), 히어로 요약(면적·축구장 환산·지정 연도)을 추가한다.

**Architecture:** PR 1(전통시장, #319)과 같은 패턴이다. nullable 컬럼 마이그레이션 → 어댑터 파서와 러너 upsert → 화면. 공원 상세는 `findUnique`로 행 전체를 읽어 `item.raw`로 넘기므로 조회 코드는 바꾸지 않는다. 문자열 가공은 순수 함수 모듈 `lib/urban/park-display.ts`에 둔다.

**Tech Stack:** Next.js App Router(ISR), Prisma + PostgreSQL/PostGIS, fast-xml-parser, Vitest(SSR은 `renderToStaticMarkup`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` (4·5·6·8·9절, 공원 부분)

## Global Constraints

- 새 컬럼은 전부 nullable. 백필 마이그레이션 금지.
- 원본 문자열을 저장하고, 분리·계산은 표시 시점에 한다.
- `etcFclty`(기타 시설)는 표시하지 않으므로 저장하지 않는다(스펙 4절).
- 값이 null이면 행·묶음·카드를 숨긴다. `'-'` 행을 만들지 않는다.
- 색은 `--color-*` 토큰만, 한글 본문 14px 이상(`text-sm` 이상), 보조 캡션만 `text-xs`.
- 마이그레이션은 손으로 쓴 SQL 폴더 하나만 좁게 `git add`(`prisma migrate dev` 금지).
- 공용 파싱 헬퍼는 `scripts/ingest/amenities/parse-helpers.ts`(PR 1)를 쓴다.
- 운영 사이트에 자동 요청을 반복하지 않는다.
- 커밋 메시지 끝에 다음 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
  ```

## Review Focus

1. **시설 문자열 구분자 섞임**: 9/30 실측 1,000건에서 `+` 1,009회, `,` 27회, `/` 4회가 나왔다. 셋 다 나눠야 칩이 한 덩어리로 붙지 않는다. → Task 2 테스트
2. **시설이 하나도 없는 공원**(약 72%): "공원 시설" 카드가 통째로 숨어야 하고, 빈 묶음 제목만 남으면 안 된다. → Task 3 테스트
3. **작은 공원의 축구장 환산**: 면적 1,500㎡ 같은 어린이공원이 "축구장 약 0개"로 나오면 안 된다. → Task 2 테스트
4. **숫자로 바뀐 전화번호**: 하이픈 없는 번호는 XML 파서가 숫자로 바꿔 앞자리 0이 사라진다. 버려야 한다. → Task 1 테스트
5. **기존 행의 `'-'`**: 공원 유형·면적이 없는 공원에서 지금 `'-'`로 나오는 행도 같은 원칙으로 숨긴다. → Task 3 테스트

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `prisma/schema.prisma` | `Park` 컬럼 7개 | 수정 |
| `prisma/migrations/20261001000001_add_park_detail_fields/migration.sql` | ALTER TABLE | 생성 |
| `scripts/ingest/amenities/types.ts` | `NormalizedPark` 필드 7개 | 수정 |
| `scripts/ingest/amenities/adapter-park.ts` | 새 필드 파싱 | 수정 |
| `scripts/ingest/amenities/runner.ts` | `ingestParks` upsert 컬럼 | 수정 |
| `lib/urban/park-display.ts` | 시설 분리·묶음, 축구장 환산, 히어로 문구 | 생성 |
| `app/(public)/urban/[category]/_components/park-info.tsx` | 행 추가, null 행 숨김 | 수정 |
| `app/(public)/urban/[category]/_components/park-facilities.tsx` | "공원 시설" 카드 | 생성 |
| `app/(public)/urban/[category]/_components/urban-hero.tsx` | 선택 prop `summaryLine` | 수정 |
| `app/(public)/urban/[category]/[id]/page.tsx` | 공원일 때 카드·히어로 문구 | 수정 |
| `tests/ingest/amenities/fixtures/park-detail-sample.xml` | 실측 기반 픽스처 | 생성 |
| `tests/ingest/amenities/adapter-park-detail.test.ts` | 파서 테스트 | 생성 |
| `tests/lib/park-display.test.ts` | 표시 헬퍼 테스트 | 생성 |
| `tests/components/park-detail-ssr.test.ts` | 정보·시설 카드·히어로 SSR 테스트 | 생성 |
| `tests/_helpers/seed-e2e.ts` | e2e 공원 시드 | 수정 |
| `tests/e2e/urban-park-detail.spec.ts` | 상세 e2e | 생성 |

---

### Task 1: 스키마·마이그레이션·파서·러너

**Files:**
- Modify: `prisma/schema.prisma` (`model Park`)
- Create: `prisma/migrations/20261001000001_add_park_detail_fields/migration.sql`
- Modify: `scripts/ingest/amenities/types.ts` (`NormalizedPark`)
- Modify: `scripts/ingest/amenities/adapter-park.ts` (`rows.push`)
- Modify: `scripts/ingest/amenities/runner.ts` (`ingestParks`)
- Create: `tests/ingest/amenities/fixtures/park-detail-sample.xml`
- Test: `tests/ingest/amenities/adapter-park-detail.test.ts`

**Interfaces:**
- Consumes: `parse-helpers.ts`의 `strOrNull`, `parseRefDate`, `clip`
- Produces: `NormalizedPark`와 Prisma `Park`에 같은 이름의 필드
  ```ts
  facilitySport: string | null;       // mvmFclty
  facilityPlay: string | null;        // amsmtFclty
  facilityConvenience: string | null; // cnvnncFclty
  facilityCulture: string | null;     // cltrFclty
  designatedAt: Date | null;          // appnNtfcDate
  managingOrg: string | null;         // institutionNm
  tel: string | null;                 // phoneNumber
  ```

- [ ] **Step 1: 픽스처 작성**

```xml
<!-- tests/ingest/amenities/fixtures/park-detail-sample.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <manageNo>41220-00405</manageNo>
        <parkNm>근린공원 1호(황해자유구역 현덕지구)</parkNm>
        <parkSe>근린공원</parkSe>
        <rdnmadr></rdnmadr>
        <lnmadr>경기도 평택시 현덕면 장수리 264-18</lnmadr>
        <latitude>36.93667042</latitude>
        <longitude>126.914174</longitude>
        <parkAr>58462</parkAr>
        <mvmFclty>야외헬스기구+체력단련시설</mvmFclty>
        <amsmtFclty>조합놀이대+그네</amsmtFclty>
        <cnvnncFclty>정자,의자/음수전</cnvnncFclty>
        <cltrFclty>화장실+야외무대</cltrFclty>
        <etcFclty>관리사무소</etcFclty>
        <appnNtfcDate>2016-06-17</appnNtfcDate>
        <institutionNm>경기도 평택시청</institutionNm>
        <phoneNumber>031-8024-4248</phoneNumber>
        <referenceDate>2026-03-13</referenceDate>
      </item>
      <item>
        <manageNo>41220-00406</manageNo>
        <parkNm>빈시설공원</parkNm>
        <parkSe>어린이공원</parkSe>
        <lnmadr>경기도 평택시 현덕면 권관리 824</lnmadr>
        <latitude>36.929521</latitude>
        <longitude>126.907927</longitude>
        <parkAr>1500</parkAr>
        <mvmFclty></mvmFclty>
        <amsmtFclty></amsmtFclty>
        <cnvnncFclty></cnvnncFclty>
        <cltrFclty></cltrFclty>
        <appnNtfcDate></appnNtfcDate>
        <institutionNm></institutionNm>
        <phoneNumber>0318024424</phoneNumber>
        <referenceDate>2026-03-13</referenceDate>
      </item>
    </items>
    <numOfRows>1000</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>2</totalCount>
  </body>
</response>
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// tests/ingest/amenities/adapter-park-detail.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkXml } from '@/scripts/ingest/amenities/adapter-park';

const xml = readFileSync(resolve('tests/ingest/amenities/fixtures/park-detail-sample.xml'), 'utf-8');
const rows = parseParkXml(xml).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-park 상세 필드', () => {
  it('시설 4종·지정 고시일·관리기관·전화를 원문 그대로 담는다', () => {
    const p = byName('근린공원 1호(황해자유구역 현덕지구)');
    expect(p.facilitySport).toBe('야외헬스기구+체력단련시설');
    expect(p.facilityPlay).toBe('조합놀이대+그네');
    expect(p.facilityConvenience).toBe('정자,의자/음수전');
    expect(p.facilityCulture).toBe('화장실+야외무대');
    expect(p.designatedAt?.toISOString()).toBe('2016-06-17T00:00:00.000Z');
    expect(p.managingOrg).toBe('경기도 평택시청');
    expect(p.tel).toBe('031-8024-4248');
  });

  it('기타 시설(etcFclty)은 담지 않는다', () => {
    expect(byName('근린공원 1호(황해자유구역 현덕지구)')).not.toHaveProperty('facilityEtc');
  });

  it('빈 값은 null, 숫자로 바뀐 전화번호는 버린다', () => {
    const p = byName('빈시설공원');
    expect(p.facilitySport).toBeNull();
    expect(p.facilityPlay).toBeNull();
    expect(p.facilityConvenience).toBeNull();
    expect(p.facilityCulture).toBeNull();
    expect(p.designatedAt).toBeNull();
    expect(p.managingOrg).toBeNull();
    expect(p.tel).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-park-detail.test.ts`
Expected: FAIL — `expected undefined to be '야외헬스기구+체력단련시설'`

- [ ] **Step 4: 스키마와 마이그레이션**

`prisma/schema.prisma`의 `model Park`에서 `referenceDate` 줄 아래에 추가한다.

```prisma
  facilitySport       String?   @db.VarChar(300)
  facilityPlay        String?   @db.VarChar(300)
  facilityConvenience String?   @db.VarChar(300)
  facilityCulture     String?   @db.VarChar(300)
  designatedAt        DateTime? @db.Date
  managingOrg         String?   @db.VarChar(100)
  tel                 String?   @db.VarChar(30)
```

```sql
-- prisma/migrations/20261001000001_add_park_detail_fields/migration.sql
-- 전국도시공원정보표준데이터에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 2).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다. 기타 시설(etcFclty)은 표시하지 않아 저장하지 않는다.
ALTER TABLE "Park"
  ADD COLUMN "facilitySport" VARCHAR(300),
  ADD COLUMN "facilityPlay" VARCHAR(300),
  ADD COLUMN "facilityConvenience" VARCHAR(300),
  ADD COLUMN "facilityCulture" VARCHAR(300),
  ADD COLUMN "designatedAt" DATE,
  ADD COLUMN "managingOrg" VARCHAR(100),
  ADD COLUMN "tel" VARCHAR(30);
```

Run: `pnpm test:db:migrate && pnpm prisma generate`
Expected: `Applying migration 20261001000001_add_park_detail_fields` → `All migrations have been successfully applied.` 다음 `Generated Prisma Client`

- [ ] **Step 5: 타입·파서·러너**

`types.ts`의 `NormalizedPark`에 Interfaces의 7개 필드를 `referenceDate` 아래에 추가한다.

`adapter-park.ts` import를 바꾼다.

```ts
import { strOrNull, parseRefDate, clip } from './parse-helpers';
```

`rows.push({ ... })`의 `referenceDate` 줄 다음에 추가한다.

```ts
      facilitySport: clip(strOrNull(item.mvmFclty), 300),
      facilityPlay: clip(strOrNull(item.amsmtFclty), 300),
      facilityConvenience: clip(strOrNull(item.cnvnncFclty), 300),
      facilityCulture: clip(strOrNull(item.cltrFclty), 300),
      designatedAt: parseRefDate(item.appnNtfcDate),
      managingOrg: clip(strOrNull(item.institutionNm), 100),
      // parseTagValue가 하이픈 없는 번호를 숫자로 바꿔 앞자리 0이 사라진다 → 문자열로 온 값만 신뢰.
      tel: typeof item.phoneNumber === 'string' ? clip(strOrNull(item.phoneNumber), 30) : null,
```

`runner.ts`의 `ingestParks` 안 `values`와 SQL을 바꾼다.

```ts
    const values = chunk.map((r: NormalizedPark) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.parkType ?? null}, ${r.area ?? null}, ${locationSql(r.lat, r.lng)}, ${r.referenceDate ?? null},
        ${r.facilitySport}, ${r.facilityPlay}, ${r.facilityConvenience}, ${r.facilityCulture},
        ${r.designatedAt}::date, ${r.managingOrg}, ${r.tel}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "Park" ("sourceId", name, address, "parkType", area, location, "referenceDate",
        "facilitySport", "facilityPlay", "facilityConvenience", "facilityCulture",
        "designatedAt", "managingOrg", tel, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "parkType" = EXCLUDED."parkType",
        area = EXCLUDED.area,
        location = EXCLUDED.location,
        "referenceDate" = EXCLUDED."referenceDate",
        "facilitySport" = EXCLUDED."facilitySport",
        "facilityPlay" = EXCLUDED."facilityPlay",
        "facilityConvenience" = EXCLUDED."facilityConvenience",
        "facilityCulture" = EXCLUDED."facilityCulture",
        "designatedAt" = EXCLUDED."designatedAt",
        "managingOrg" = EXCLUDED."managingOrg",
        tel = EXCLUDED.tel,
        "updatedAt" = NOW()
    `;
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-park-detail.test.ts tests/ingest/amenities/adapter-park.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 7: 로컬 실수집으로 upsert 검증** (공공 API 약 17회 호출, 로컬 docker DB에 기록)

`grep -c 5433 .env.local`이 1 이상인지 먼저 확인한다(0이면 멈추고 사용자에게 묻는다).

Run: `pnpm exec dotenv -e .env.local -- tsx scripts/ingest/amenities/runner.ts --source=park`
Expected: `upserted` 약 16,895

Run:
```bash
docker exec imjang-on-db psql -U imjang -d imjang_on -c "SELECT count(*) total, count(\"facilitySport\") sport, count(\"facilityPlay\") play, count(\"facilityConvenience\") conv, count(\"facilityCulture\") cult, count(\"designatedAt\") des, count(\"managingOrg\") org, count(tel) tel FROM \"Park\";"
```
Expected: 시설 4종 각 약 25~30%(교양은 한 자릿수 %), 지정 고시일 약 78%, 관리기관·전화 약 98%. 크게 벗어나면(예: 0) 원인을 찾을 때까지 다음 단계로 가지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/20261001000001_add_park_detail_fields scripts/ingest/amenities/types.ts scripts/ingest/amenities/adapter-park.ts scripts/ingest/amenities/runner.ts tests/ingest/amenities/fixtures/park-detail-sample.xml tests/ingest/amenities/adapter-park-detail.test.ts
git status --short prisma/migrations
git commit -m "feat(ingest): 공원 시설 4종·지정고시일·관리기관·전화 수집

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 2: 공원 표시 헬퍼

**Files:**
- Create: `lib/urban/park-display.ts`
- Test: `tests/lib/park-display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SOCCER_FIELD_M2 = 7140;
  export function splitFacilities(s: string | null | undefined): string[];
  export interface ParkFacilityGroup { label: string; items: string[] }
  export function parkFacilityGroups(r: {
    facilityPlay?: string | null; facilitySport?: string | null;
    facilityConvenience?: string | null; facilityCulture?: string | null;
  }): ParkFacilityGroup[]; // 순서: 놀이시설, 운동시설, 편의시설, 교양시설. 빈 묶음 제외
  export function soccerFieldCount(area: number | null | undefined): number | null;
  export function buildParkHeroLine(r: { area?: number | null; designatedAt?: Date | null }): string | null;
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/park-display.test.ts
import { describe, it, expect } from 'vitest';
import {
  splitFacilities,
  parkFacilityGroups,
  soccerFieldCount,
  buildParkHeroLine,
} from '@/lib/urban/park-display';

describe('splitFacilities', () => {
  it('+ , / 를 모두 구분자로 쓰고 공백·빈 항목·중복을 정리한다', () => {
    expect(splitFacilities('정자,의자/음수전+ 정자 +')).toEqual(['정자', '의자', '음수전']);
  });
  it('빈 값은 빈 배열', () => {
    expect(splitFacilities(null)).toEqual([]);
    expect(splitFacilities('')).toEqual([]);
  });
});

describe('parkFacilityGroups', () => {
  it('놀이·운동·편의·교양 순서, 빈 묶음은 뺀다', () => {
    expect(
      parkFacilityGroups({
        facilitySport: '야외헬스기구',
        facilityPlay: '조합놀이대+그네',
        facilityConvenience: null,
        facilityCulture: '화장실',
      }),
    ).toEqual([
      { label: '놀이시설', items: ['조합놀이대', '그네'] },
      { label: '운동시설', items: ['야외헬스기구'] },
      { label: '교양시설', items: ['화장실'] },
    ]);
  });
  it('전부 비면 빈 배열', () => {
    expect(parkFacilityGroups({})).toEqual([]);
  });
});

describe('soccerFieldCount', () => {
  it('7,140㎡ 기준 반올림', () => {
    expect(soccerFieldCount(58462)).toBe(8);
    expect(soccerFieldCount(2950000)).toBe(413);
  });
  it('1개 미만이면 null (축구장 약 0개 금지)', () => {
    expect(soccerFieldCount(1500)).toBeNull();
    expect(soccerFieldCount(3500)).toBeNull();
  });
  it('없으면 null', () => {
    expect(soccerFieldCount(null)).toBeNull();
    expect(soccerFieldCount(0)).toBeNull();
  });
});

describe('buildParkHeroLine', () => {
  it('면적 · 축구장 · 지정 연도', () => {
    expect(buildParkHeroLine({ area: 58462, designatedAt: new Date('2016-06-17T00:00:00Z') }))
      .toBe('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정');
  });
  it('작은 공원은 축구장 문구를 뺀다', () => {
    expect(buildParkHeroLine({ area: 1500 })).toBe('면적 1,500 ㎡');
  });
  it('아무 값도 없으면 null', () => {
    expect(buildParkHeroLine({})).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/park-display.test.ts`
Expected: FAIL — `Cannot find module '@/lib/urban/park-display'`

- [ ] **Step 3: 구현**

```ts
// lib/urban/park-display.ts
// 공원 원문 필드(시설 문자열·면적·지정 고시일)를 화면 문구로 바꾸는 순수 함수.
import { formatParkArea } from '@/lib/urban/adapters/park';

/** 국제 규격 축구장 1면(105m × 68m). */
export const SOCCER_FIELD_M2 = 7140;

/** 실측(2026-09-30) 구분자는 '+'가 대부분이고 ',' '/'가 섞여 있다. */
export function splitFacilities(s: string | null | undefined): string[] {
  if (!s) return [];
  const parts = s.split(/[+,/]/).map((x) => x.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

export interface ParkFacilityGroup {
  label: string;
  items: string[];
}

const GROUPS = [
  { key: 'facilityPlay', label: '놀이시설' },
  { key: 'facilitySport', label: '운동시설' },
  { key: 'facilityConvenience', label: '편의시설' },
  { key: 'facilityCulture', label: '교양시설' },
] as const;

export function parkFacilityGroups(r: {
  facilityPlay?: string | null;
  facilitySport?: string | null;
  facilityConvenience?: string | null;
  facilityCulture?: string | null;
}): ParkFacilityGroup[] {
  return GROUPS.map((g) => ({ label: g.label, items: splitFacilities(r[g.key]) })).filter(
    (g) => g.items.length > 0,
  );
}

export function soccerFieldCount(area: number | null | undefined): number | null {
  if (!area) return null;
  const n = Math.round(area / SOCCER_FIELD_M2);
  return n >= 1 ? n : null;
}

export function buildParkHeroLine(r: { area?: number | null; designatedAt?: Date | null }): string | null {
  const parts: string[] = [];
  const area = formatParkArea(r.area);
  if (area) parts.push(`면적 ${area}`);
  const fields = soccerFieldCount(r.area);
  if (fields) parts.push(`축구장 약 ${fields.toLocaleString('ko-KR')}개 크기`);
  if (r.designatedAt) parts.push(`${r.designatedAt.getUTCFullYear()}년 지정`);
  return parts.length ? parts.join(' · ') : null;
}
```

`soccerFieldCount(3500)`은 `Math.round(0.49) = 0`이라 null이 된다. 테스트의 두 번째 케이스가 그 경계를 고정한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/park-display.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/urban/park-display.ts tests/lib/park-display.test.ts
git commit -m "feat(park): 시설 묶음·축구장 환산·히어로 문구 표시 헬퍼

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 3: 정보 카드·시설 카드·히어로 요약

**Files:**
- Modify: `app/(public)/urban/[category]/_components/park-info.tsx`
- Create: `app/(public)/urban/[category]/_components/park-facilities.tsx`
- Modify: `app/(public)/urban/[category]/_components/urban-hero.tsx`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`
- Test: `tests/components/park-detail-ssr.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ParkRaw`(=Prisma `Park`) 새 필드, Task 2의 `parkFacilityGroups`, `buildParkHeroLine`
- Produces:
  - `ParkInfo({ item })`: 값이 있는 행만 렌더(공원 유형, 면적, 지정 고시일, 관리기관, 전화, 주소)
  - `ParkFacilities({ item }: { item: UrbanItem<ParkRaw> }): JSX.Element | null`
  - `UrbanHero`에 선택 prop `summaryLine?: string | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/components/park-detail-ssr.test.ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import { ParkFacilities } from '@/app/(public)/urban/[category]/_components/park-facilities';
import { UrbanHero } from '@/app/(public)/urban/[category]/_components/urban-hero';
import { parkDef, type ParkRaw } from '@/lib/urban/adapters/park';
import type { UrbanItem } from '@/lib/urban/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

function item(raw: Partial<ParkRaw>): UrbanItem<ParkRaw> {
  return { id: 1n, name: '테스트공원', address: '경기도 평택시 현덕면 장수리 264-18', sigunguCode: null, raw: { address: '경기도 평택시 현덕면 장수리 264-18', ...raw } as ParkRaw };
}

const filled = item({
  parkType: '근린공원',
  area: 58462,
  facilityPlay: '조합놀이대+그네',
  facilitySport: '야외헬스기구',
  facilityConvenience: '정자,의자',
  facilityCulture: null,
  designatedAt: new Date('2016-06-17T00:00:00Z'),
  managingOrg: '경기도 평택시청',
  tel: '031-8024-4248',
});
const empty = item({ parkType: null, area: null });

describe('ParkInfo', () => {
  it('새 행: 지정 고시일·관리기관·전화', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: filled }));
    expect(html).toContain('2016-06-17');
    expect(html).toContain('경기도 평택시청');
    expect(html).toContain('031-8024-4248');
  });

  it('값이 없는 행은 숨긴다 ("-" 금지), 주소는 남는다', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: empty }));
    expect(html).not.toContain('공원 유형');
    expect(html).not.toContain('면적');
    expect(html).not.toContain('관리기관');
    expect(html).not.toContain('>-<');
    expect(html).toContain('경기도 평택시 현덕면 장수리 264-18');
  });
});

describe('ParkFacilities', () => {
  it('값이 있는 묶음만 칩으로', () => {
    const html = renderToStaticMarkup(createElement(ParkFacilities, { item: filled }));
    expect(html).toContain('공원 시설');
    expect(html).toContain('놀이시설');
    expect(html).toContain('>그네<');
    expect(html).toContain('>의자<');
    expect(html).not.toContain('교양시설');
  });

  it('시설이 하나도 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ParkFacilities, { item: empty }))).toBe('');
  });
});

describe('UrbanHero summaryLine', () => {
  it('summaryLine이 있으면 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(UrbanHero, { item: filled, def: parkDef, summaryLine: '면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정' }),
    );
    expect(html).toContain('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/components/park-detail-ssr.test.ts`
Expected: FAIL — `Cannot find module '.../park-facilities'`

- [ ] **Step 3: 구현**

`park-info.tsx` 전체를 바꾼다.

```tsx
import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import { formatParkArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkInfo({ item }: { item: UrbanItem<ParkRaw> }) {
  const r = item.raw;
  const rows: Array<[string, string | null]> = [
    ['공원 유형', r.parkType],
    ['면적', formatParkArea(r.area)],
    ['지정 고시일', r.designatedAt ? r.designatedAt.toISOString().slice(0, 10) : null],
    ['관리기관', r.managingOrg],
    ['전화', r.tel],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 기본정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows
          .filter((row): row is [string, string] => !!row[1])
          .map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
              <span className="text-sm text-[var(--color-muted)]">{label}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{value}</span>
            </div>
          ))}
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5 sm:col-span-2">
          <span className="text-sm text-[var(--color-muted)]">주소</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.address}</span>
        </div>
      </div>
    </Card>
  );
}
```

```tsx
// app/(public)/urban/[category]/_components/park-facilities.tsx
import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { parkFacilityGroups } from '@/lib/urban/park-display';

export function ParkFacilities({ item }: { item: UrbanItem<ParkRaw> }) {
  const groups = parkFacilityGroups(item.raw);
  if (groups.length === 0) return null;
  return (
    <Card id="facilities">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 시설</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <h3 className="mb-2.5 text-sm font-bold text-[var(--color-text)]">{g.label}</h3>
            <ul className="flex flex-wrap gap-2">
              {g.items.map((it) => (
                <li
                  key={it}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1.5 text-sm font-semibold text-[var(--color-blue-dark)]"
                >{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

`urban-hero.tsx`: 시그니처를 바꾼다.

```tsx
export function UrbanHero({
  item,
  def,
  summaryLine,
}: {
  item: UrbanItem;
  def: UrbanCategoryDef;
  summaryLine?: string | null;
}) {
```

주소 줄 `<div className="mt-2 flex …">…</div>` 다음, 바깥 `min-w-0` div 닫기 전에 추가한다.

```tsx
        {summaryLine && (
          <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm font-bold text-[var(--color-blue)]">
            {summaryLine}
          </p>
        )}
```

`page.tsx`:

import 추가.

```tsx
import { ParkFacilities } from '../_components/park-facilities';
import { buildParkHeroLine } from '@/lib/urban/park-display';
```

`<UrbanHero item={item} def={def} />`를 바꾼다.

```tsx
      <UrbanHero
        item={item}
        def={def}
        summaryLine={isPark ? buildParkHeroLine((item as UrbanItem<ParkRaw>).raw) : null}
      />
```

`<ParkInfo item={item as UrbanItem<ParkRaw>} />`를 바꾼다.

```tsx
            <>
              <ParkInfo item={item as UrbanItem<ParkRaw>} />
              <ParkFacilities item={item as UrbanItem<ParkRaw>} />
            </>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/components/park-detail-ssr.test.ts tests/lib/park-adapter.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/urban/[category]/_components/park-info.tsx" "app/(public)/urban/[category]/_components/park-facilities.tsx" "app/(public)/urban/[category]/_components/urban-hero.tsx" "app/(public)/urban/[category]/[id]/page.tsx" tests/components/park-detail-ssr.test.ts
git commit -m "feat(park): 공원 상세에 시설 카드·지정고시일·관리기관·전화, 히어로 요약

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 4: e2e 시드와 상세 시나리오

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts` (전통시장 시드 블록 다음)
- Create: `tests/e2e/urban-park-detail.spec.ts`

- [ ] **Step 1: 시드 추가**

```ts
  // 공원 상세 e2e용 — 시설이 채워진 공원 1곳, 빈 공원 1곳(카드 숨김 검증)
  await prisma.park.upsert({
    where: { sourceId: 'e2e-park-filled' },
    create: {
      sourceId: 'e2e-park-filled',
      name: 'e2e 시설공원',
      address: '서울특별시 서초구 서초동 1',
      parkType: '근린공원',
      area: 58462,
      facilityPlay: '조합놀이대+그네',
      facilitySport: '야외헬스기구',
      designatedAt: new Date('2016-06-17T00:00:00Z'),
      managingOrg: '서울특별시 서초구청',
      tel: '02-000-0000',
    },
    update: {},
  });
  await prisma.park.upsert({
    where: { sourceId: 'e2e-park-empty' },
    create: {
      sourceId: 'e2e-park-empty',
      name: 'e2e 빈공원',
      address: '서울특별시 서초구 서초동 2',
    },
    update: {},
  });
```

- [ ] **Step 2: e2e 작성**

```ts
// tests/e2e/urban-park-detail.spec.ts
import { test, expect } from '@playwright/test';

const list = (q: string) => `/urban/park?sido=${encodeURIComponent('서울')}&q=${encodeURIComponent(q)}`;

test.describe('공원 상세 보강', () => {
  test('시설이 있는 공원: 히어로 요약, 공원 시설 카드, 새 정보 행', async ({ page }) => {
    await page.goto(list('e2e 시설공원'));
    await page.locator('a:has(article)').first().click();

    await expect(page.getByText('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '공원 시설' })).toBeVisible();
    await expect(page.getByText('그네', { exact: true })).toBeVisible();
    await expect(page.getByText('서울특별시 서초구청')).toBeVisible();
  });

  test('빈 공원: 시설 카드 없이 주소만', async ({ page }) => {
    await page.goto(list('e2e 빈공원'));
    await page.locator('a:has(article)').first().click();

    await expect(page.getByRole('heading', { name: '공원 기본정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '공원 시설' })).toHaveCount(0);
  });
});
```

- [ ] **Step 3: 실행**

Run: `pnpm seed:e2e && pnpm test:e2e:local tests/e2e/urban-park-detail.spec.ts tests/e2e/urban-parking-detail.spec.ts`
Expected: 전부 PASS (데스크톱·모바일). 주차장 상세 spec은 `UrbanHero` 변경 회귀 확인용이다.

- [ ] **Step 4: 커밋**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/urban-park-detail.spec.ts
git commit -m "test(e2e): 공원 상세 보강 시나리오

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 5: 전체 게이트와 로컬 QA

**Files:** 없음

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`
Expected: lint 경고·오류 0, 단위 테스트 전부 PASS, build 성공

- [ ] **Step 2: 로컬 실데이터 확인**

Task 1 Step 7로 채운 로컬 DB에서 `pnpm dev`를 띄우고, 아래 두 종류를 확인한다.
- 시설 필드가 있는 공원 1곳: `SELECT id FROM "Park" WHERE "facilityPlay" IS NOT NULL LIMIT 1`
- 시설 필드가 없는 작은 어린이공원 1곳: `SELECT id FROM "Park" WHERE "facilityPlay" IS NULL AND area < 3570 LIMIT 1`

각각 `/urban/park/<id>`에서 히어로 요약, 시설 카드 노출·숨김, 정보 행을 본다. 확인 후 dev 서버를 끈다.

- [ ] **Step 3: push·PR·머지·운영 수집은 사용자 확인 후** (PR 1과 같은 절차)

머지 후 박스에서:
```bash
cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm tsx scripts/ingest/amenities/runner.ts --source=park
```
그 다음 읽기 전용 쿼리(`PGOPTIONS=-c default_transaction_read_only=on`)로 Task 1 Step 7의 채움률 쿼리를 운영 DB에 실행한다.
