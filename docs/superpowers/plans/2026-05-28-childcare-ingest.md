# 어린이집 데이터 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국사회보장정보원 `cpmsapi030`로 전국 어린이집 정보를 수집해 단일 `Childcare` 테이블에 적재하고, 월 1회 GitHub Actions로 자동 갱신한다.

**Architecture:** 기존 amenity ingest 패턴을 그대로 따른다 — 순수 파싱 함수(`parseChildcareXml`) + 수집 함수(`fetchAllChildcare`) + `runner.ts`의 chunked raw upsert. 시군구코드(arcode) ~250개를 순회하며 각 arcode당 `cpmsapi030`를 1회 호출(해당 시군구 전체 목록 반환)한다. 좌표(la/lo)는 한국 영역 검증 후 사용하고, 없거나 범위 밖이면 주소 지오코딩으로 채운다.

**Tech Stack:** Next.js / Prisma(PostgreSQL+PostGIS) / fast-xml-parser / tsx / vitest / GitHub Actions / pnpm

**Spec:** `docs/superpowers/specs/2026-05-28-childcare-ingest-design.md`

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `prisma/schema.prisma` | `Childcare` 모델 정의 | Modify |
| `prisma/migrations/20260528000000_add_childcare/migration.sql` | 테이블 + 인덱스 + GIST | Create |
| `lib/env.ts` | `CHILDCARE_API_KEY` 추가 | Modify |
| `.env.example` | 키 항목 추가 | Modify |
| `scripts/ingest/amenities/types.ts` | `NormalizedChildcare`, 소스키 확장 | Modify |
| `scripts/ingest/amenities/adapter-childcare.ts` | 파싱/수집 로직 | Create |
| `scripts/ingest/amenities/runner.ts` | `childcare` 분기 + upsert | Modify |
| `tests/ingest/amenities/fixtures/childcare-sample.xml` | 테스트 fixture | Create |
| `tests/ingest/amenities/adapter-childcare.test.ts` | 파싱 단위 테스트 | Create |
| `.github/workflows/ingest-amenities.yml` | matrix/secret 추가 | Modify |

---

## Task 1: Childcare 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (파일 끝에 모델 추가)
- Create: `prisma/migrations/20260528000000_add_childcare/migration.sql`

- [ ] **Step 1: schema.prisma에 Childcare 모델 추가**

`prisma/schema.prisma` 맨 끝(`School` 모델 다음)에 추가:

```prisma
model Childcare {
  id          BigInt                                @id @default(autoincrement())
  sourceId    String                                @unique @db.VarChar(11)
  name        String                                @db.VarChar(150)

  crType      String?                               @db.VarChar(20)
  status      String?                               @db.VarChar(10)
  vehicleOp   String?                               @db.VarChar(10)
  services    String?                               @db.VarChar(150)

  sido        String?                               @db.VarChar(20)
  sigungu     String?                               @db.VarChar(20)
  sigunguCode String                                @db.VarChar(5)
  zipcode     String?                               @db.VarChar(6)
  address     String                                @db.VarChar(300)
  tel         String?                               @db.VarChar(14)
  fax         String?                               @db.VarChar(14)
  homepage    String?                               @db.VarChar(150)
  repName     String?                               @db.VarChar(60)
  location    Unsupported("geography(Point,4326)")?

  roomCount       Int?
  roomSize        Float?
  playgroundCount Int?
  cctvCount       Int?
  staffCount      Int?
  capacity        Int?
  currentCount    Int?

  confirmDate    DateTime? @db.Date
  pauseBeginDate DateTime? @db.Date
  pauseEndDate   DateTime? @db.Date
  abolishDate    DateTime? @db.Date
  dataStdDate    DateTime? @db.Date

  classCnt00  Int?
  classCnt01  Int?
  classCnt02  Int?
  classCnt03  Int?
  classCnt04  Int?
  classCnt05  Int?
  classCntM2  Int?
  classCntM3  Int?
  classCntM5  Int?
  classCntSp  Int?
  classCntTot Int?

  childCnt00  Int?
  childCnt01  Int?
  childCnt02  Int?
  childCnt03  Int?
  childCnt04  Int?
  childCnt05  Int?
  childCntM2  Int?
  childCntM3  Int?
  childCntM5  Int?
  childCntSp  Int?
  childCntTot Int?

  emTenure0y Int?
  emTenure1y Int?
  emTenure2y Int?
  emTenure4y Int?
  emTenure6y Int?

  emRoleDirector    Int?
  emRoleTeacher     Int?
  emRoleSpecial     Int?
  emRoleTherapy     Int?
  emRoleNutrition   Int?
  emRoleNurse       Int?
  emRoleNurseAssist Int?
  emRoleCook        Int?
  emRoleOffice      Int?
  emRoleTot         Int?

  waitCnt00  Int?
  waitCnt01  Int?
  waitCnt02  Int?
  waitCnt03  Int?
  waitCnt04  Int?
  waitCnt05  Int?
  waitCntM6  Int?
  waitCntTot Int?

  updatedAt DateTime @updatedAt

  @@index([sigunguCode, status])
  @@index([crType])
}
```

- [ ] **Step 2: 마이그레이션 SQL 작성 (수동)**

`School` 모델처럼 수동 마이그레이션을 작성한다(`location`이 `Unsupported` 타입이라 GIST 인덱스는 Prisma가 생성하지 못하므로 직접 추가). `prisma/migrations/20260528000000_add_childcare/migration.sql` 생성:

```sql
-- CreateTable
CREATE TABLE "Childcare" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(11) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "crType" VARCHAR(20),
    "status" VARCHAR(10),
    "vehicleOp" VARCHAR(10),
    "services" VARCHAR(150),
    "sido" VARCHAR(20),
    "sigungu" VARCHAR(20),
    "sigunguCode" VARCHAR(5) NOT NULL,
    "zipcode" VARCHAR(6),
    "address" VARCHAR(300) NOT NULL,
    "tel" VARCHAR(14),
    "fax" VARCHAR(14),
    "homepage" VARCHAR(150),
    "repName" VARCHAR(60),
    "location" geography(Point,4326),
    "roomCount" INTEGER,
    "roomSize" DOUBLE PRECISION,
    "playgroundCount" INTEGER,
    "cctvCount" INTEGER,
    "staffCount" INTEGER,
    "capacity" INTEGER,
    "currentCount" INTEGER,
    "confirmDate" DATE,
    "pauseBeginDate" DATE,
    "pauseEndDate" DATE,
    "abolishDate" DATE,
    "dataStdDate" DATE,
    "classCnt00" INTEGER,
    "classCnt01" INTEGER,
    "classCnt02" INTEGER,
    "classCnt03" INTEGER,
    "classCnt04" INTEGER,
    "classCnt05" INTEGER,
    "classCntM2" INTEGER,
    "classCntM3" INTEGER,
    "classCntM5" INTEGER,
    "classCntSp" INTEGER,
    "classCntTot" INTEGER,
    "childCnt00" INTEGER,
    "childCnt01" INTEGER,
    "childCnt02" INTEGER,
    "childCnt03" INTEGER,
    "childCnt04" INTEGER,
    "childCnt05" INTEGER,
    "childCntM2" INTEGER,
    "childCntM3" INTEGER,
    "childCntM5" INTEGER,
    "childCntSp" INTEGER,
    "childCntTot" INTEGER,
    "emTenure0y" INTEGER,
    "emTenure1y" INTEGER,
    "emTenure2y" INTEGER,
    "emTenure4y" INTEGER,
    "emTenure6y" INTEGER,
    "emRoleDirector" INTEGER,
    "emRoleTeacher" INTEGER,
    "emRoleSpecial" INTEGER,
    "emRoleTherapy" INTEGER,
    "emRoleNutrition" INTEGER,
    "emRoleNurse" INTEGER,
    "emRoleNurseAssist" INTEGER,
    "emRoleCook" INTEGER,
    "emRoleOffice" INTEGER,
    "emRoleTot" INTEGER,
    "waitCnt00" INTEGER,
    "waitCnt01" INTEGER,
    "waitCnt02" INTEGER,
    "waitCnt03" INTEGER,
    "waitCnt04" INTEGER,
    "waitCnt05" INTEGER,
    "waitCntM6" INTEGER,
    "waitCntTot" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Childcare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Childcare_sourceId_key" ON "Childcare"("sourceId");

-- CreateIndex
CREATE INDEX "Childcare_sigunguCode_status_idx" ON "Childcare"("sigunguCode", "status");

-- CreateIndex
CREATE INDEX "Childcare_crType_idx" ON "Childcare"("crType");

-- PostGIS GIST index
CREATE INDEX IF NOT EXISTS "Childcare_location_idx" ON "Childcare" USING GIST ("location");
```

- [ ] **Step 3: 마이그레이션 적용 + 클라이언트 재생성**

Run: `pnpm prisma:deploy && pnpm prisma:generate`
Expected: `Applying migration 20260528000000_add_childcare` 출력 후 `Generated Prisma Client` 성공. 에러 없음.

- [ ] **Step 4: 타입 체크로 모델 인식 확인**

Run: `pnpm exec tsc --noEmit`
Expected: tsc 통과(이미 존재하던 에러 외 신규 에러 없음). `prisma.childcare`가 클라이언트에 노출됨.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260528000000_add_childcare/migration.sql
git commit -m "feat(db): Childcare 테이블 + 마이그레이션 추가"
```

---

## Task 2: 환경변수 + 정규화 타입

**Files:**
- Modify: `lib/env.ts:9-12` (PUBLIC_DATA_KEY 옆)
- Modify: `.env.example`
- Modify: `scripts/ingest/amenities/types.ts`

- [ ] **Step 1: lib/env.ts에 CHILDCARE_API_KEY 추가**

`NEIS_API_KEY` 줄 아래에 추가:

```ts
  PUBLIC_DATA_KEY: z.string().optional(),
  NEIS_API_KEY: z.string().optional(),
  CHILDCARE_API_KEY: z.string().optional(),
  KAKAO_REST_KEY: z.string().optional(),
```

- [ ] **Step 2: .env.example에 항목 추가**

`.env.example`에 한 줄 추가:

```
CHILDCARE_API_KEY=
```

- [ ] **Step 3: types.ts에 NormalizedChildcare + 소스키 추가**

`scripts/ingest/amenities/types.ts`의 `NormalizedSchool` 인터페이스 뒤에 추가:

```ts
export interface NormalizedChildcare {
  sourceId: string;
  name: string;
  crType: string | null;
  status: string | null;
  vehicleOp: string | null;
  services: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string;
  zipcode: string | null;
  address: string;
  tel: string | null;
  fax: string | null;
  homepage: string | null;
  repName: string | null;
  lat: number | null;
  lng: number | null;
  roomCount: number | null;
  roomSize: number | null;
  playgroundCount: number | null;
  cctvCount: number | null;
  staffCount: number | null;
  capacity: number | null;
  currentCount: number | null;
  confirmDate: Date | null;
  pauseBeginDate: Date | null;
  pauseEndDate: Date | null;
  abolishDate: Date | null;
  dataStdDate: Date | null;
  classCnt00: number | null;
  classCnt01: number | null;
  classCnt02: number | null;
  classCnt03: number | null;
  classCnt04: number | null;
  classCnt05: number | null;
  classCntM2: number | null;
  classCntM3: number | null;
  classCntM5: number | null;
  classCntSp: number | null;
  classCntTot: number | null;
  childCnt00: number | null;
  childCnt01: number | null;
  childCnt02: number | null;
  childCnt03: number | null;
  childCnt04: number | null;
  childCnt05: number | null;
  childCntM2: number | null;
  childCntM3: number | null;
  childCntM5: number | null;
  childCntSp: number | null;
  childCntTot: number | null;
  emTenure0y: number | null;
  emTenure1y: number | null;
  emTenure2y: number | null;
  emTenure4y: number | null;
  emTenure6y: number | null;
  emRoleDirector: number | null;
  emRoleTeacher: number | null;
  emRoleSpecial: number | null;
  emRoleTherapy: number | null;
  emRoleNutrition: number | null;
  emRoleNurse: number | null;
  emRoleNurseAssist: number | null;
  emRoleCook: number | null;
  emRoleOffice: number | null;
  emRoleTot: number | null;
  waitCnt00: number | null;
  waitCnt01: number | null;
  waitCnt02: number | null;
  waitCnt03: number | null;
  waitCnt04: number | null;
  waitCnt05: number | null;
  waitCntM6: number | null;
  waitCntTot: number | null;
}
```

`AmenitySourceKey`에 `'childcare'` 추가하고, `AMENITY_INGEST_SOURCE`에 매핑 추가:

```ts
export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'park'
  | 'school'
  | 'childcare';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'park': 'amenity-park',
  'school': 'amenity-school',
  'childcare': 'amenity-childcare',
};
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음. (`AMENITY_INGEST_SOURCE`는 `Record<AmenitySourceKey, string>`이라 누락 시 에러 — 추가했으므로 통과.)

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts .env.example scripts/ingest/amenities/types.ts
git commit -m "feat(ingest): CHILDCARE_API_KEY env + NormalizedChildcare 타입 추가"
```

---

## Task 3: 파싱 함수 (TDD)

`cpmsapi030` 응답은 `<response><item>...</item></response>` 구조다(기존 `getItems`는 `response.body.items.item`을 기대하므로 재사용 불가 — 직접 추출). 응답에 `arcode` 필드가 없으므로 `sigunguCode`는 호출 시 넘긴 arcode로 채운다.

**Files:**
- Create: `tests/ingest/amenities/fixtures/childcare-sample.xml`
- Create: `scripts/ingest/amenities/adapter-childcare.ts`
- Test: `tests/ingest/amenities/adapter-childcare.test.ts`

- [ ] **Step 1: fixture XML 작성**

`tests/ingest/amenities/fixtures/childcare-sample.xml` 생성. 명세 예제 기반(단, 명세 예제의 la/lo 좌표값이 깨져 있어 1번 항목은 실제 서울 좌표로 보정, 2번 항목은 범위 밖 값을 그대로 두어 검증 분기를 테스트). 정상 1건 + 폐지 1건:

```xml
<response>
  <item>
    <sidoname>서울특별시</sidoname>
    <sigunguname>송파구</sigunguname>
    <stcode>11620000341</stcode>
    <crname>1111어린이집</crname>
    <crtypename>가정</crtypename>
    <crstatusname>정상</crstatusname>
    <zipcode>151770</zipcode>
    <craddr>서울특별시 송파구 송파대로39길 94</craddr>
    <crtelno>02-1111-2222</crtelno>
    <crfaxno>02-1111-3333</crfaxno>
    <crhome>http://cafe.daum.net/1111child</crhome>
    <nrtrroomcnt>5</nrtrroomcnt>
    <nrtrroomsize>193</nrtrroomsize>
    <plgrdco>3</plgrdco>
    <cctvinstlcnt>7</cctvinstlcnt>
    <chcrtescnt>2</chcrtescnt>
    <crcapat>18</crcapat>
    <crchcnt>17</crchcnt>
    <la>37.50452212</la>
    <lo>127.1043009</lo>
    <crcargbname>운영</crcargbname>
    <crcnfmdt>2007-01-10</crcnfmdt>
    <crpausebegindt></crpausebegindt>
    <crpauseenddt></crpauseenddt>
    <crabldt></crabldt>
    <datastdrdt>2019-04-01</datastdrdt>
    <crspec>시간연장형,일시보육</crspec>
    <class_cnt_tot>7</class_cnt_tot>
    <child_cnt_tot>70</child_cnt_tot>
    <em_cnt_a1>1</em_cnt_a1>
    <em_cnt_a2>4</em_cnt_a2>
    <em_cnt_tot>7</em_cnt_tot>
    <crrepname>홍길동</crrepname>
    <ew_cnt_01>4</ew_cnt_01>
    <ew_cnt_tot>18</ew_cnt_tot>
  </item>
  <item>
    <sidoname>전라북도</sidoname>
    <sigunguname>전주시 완산구</sigunguname>
    <stcode>11200000040</stcode>
    <crname>2222어린이집</crname>
    <crtypename>민간</crtypename>
    <crstatusname>폐지</crstatusname>
    <zipcode>55088</zipcode>
    <craddr>전라북도 전주시 완산구 하거마7길 18 (삼천동1가)</craddr>
    <crtelno>063-2222-2222</crtelno>
    <crfaxno>063-2222-3333</crfaxno>
    <crhome></crhome>
    <crcapat>7</crcapat>
    <crchcnt>7</crchcnt>
    <la>47.79626769</la>
    <lo>137.1250128</lo>
    <crcargbname>미운영</crcargbname>
    <crcnfmdt>2007-05-10</crcnfmdt>
    <crabldt>2015-05-04</crabldt>
    <datastdrdt>2019-04-01</datastdrdt>
    <crspec>일반</crspec>
    <crrepname>홍길동2</crrepname>
  </item>
</response>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/ingest/amenities/adapter-childcare.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseChildcareXml,
  detectChildcareError,
} from '@/scripts/ingest/amenities/adapter-childcare';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/childcare-sample.xml'),
  'utf-8',
);

describe('adapter-childcare', () => {
  it('정상·폐지 2건을 모두 파싱한다 (상태 보존)', () => {
    const rows = parseChildcareXml(xml, '11710');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status)).toEqual(['정상', '폐지']);
  });

  it('sigunguCode는 호출 arcode로 채운다 (응답에 없음)', () => {
    const rows = parseChildcareXml(xml, '11710');
    expect(rows.every((r) => r.sigunguCode === '11710')).toBe(true);
  });

  it('핵심 필드와 카운트를 매핑한다', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    expect(a.name).toBe('1111어린이집');
    expect(a.crType).toBe('가정');
    expect(a.capacity).toBe(18);
    expect(a.currentCount).toBe(17);
    expect(a.cctvCount).toBe(7);
    expect(a.classCntTot).toBe(7);
    expect(a.emRoleDirector).toBe(1);
    expect(a.waitCntTot).toBe(18);
  });

  it('한국 영역 좌표만 사용하고 범위 밖은 null 처리한다', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    const b = rows.find((r) => r.sourceId === '11200000040')!;
    expect(a.lat).toBeCloseTo(37.50452212);
    expect(a.lng).toBeCloseTo(127.1043009);
    expect(b.lat).toBeNull();
    expect(b.lng).toBeNull();
  });

  it('빈 날짜/빈 홈페이지는 null', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    expect(a.pauseBeginDate).toBeNull();
    expect(a.abolishDate).toBeNull();
    expect(a.confirmDate?.toISOString().slice(0, 10)).toBe('2007-01-10');
    const b = rows.find((r) => r.sourceId === '11200000040')!;
    expect(b.homepage).toBeNull();
    expect(b.abolishDate?.toISOString().slice(0, 10)).toBe('2015-05-04');
  });

  it('정보/에러 코드를 분류한다', () => {
    expect(detectChildcareError('<response>INFO-100</response>')).toBe('key');
    expect(detectChildcareError('<response>INFO-300</response>')).toBe('rate');
    expect(detectChildcareError('<response>ERROR-200</response>')).toBe('server');
    expect(detectChildcareError('<response>INFO-200</response>')).toBeNull();
    expect(parseChildcareXml('<response>INFO-200</response>', '11710')).toEqual([]);
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/ingest/amenities/adapter-childcare.test.ts`
Expected: FAIL — `adapter-childcare` 모듈이 없어 import 에러.

- [ ] **Step 4: adapter-childcare.ts 파싱부 구현**

`scripts/ingest/amenities/adapter-childcare.ts` 생성:

```ts
import { parseXml, parseCommaNumber } from '@/scripts/ingest/xml-parse';
import type { NormalizedChildcare } from './types';

const BASE_URL =
  'http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request';

// 한국 영역 bbox — 명세 예제 좌표가 깨져 있어 검증이 필요
const KR_LAT = [33, 39] as const;
const KR_LNG = [124, 132] as const;

function pickStr(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function pickInt(item: Record<string, unknown>, key: string): number | null {
  return parseCommaNumber(item[key] as string | number | null | undefined);
}

function pickDate(item: Record<string, unknown>, key: string): Date | null {
  const v = item[key];
  if (v == null) return null;
  const digits = String(v).trim().replace(/-/g, '');
  if (digits.length !== 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function pickCoord(item: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const lat = Number(item.la);
  const lng = Number(item.lo);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KR_LAT[0] && lat <= KR_LAT[1] &&
    lng >= KR_LNG[0] && lng <= KR_LNG[1]
  ) {
    return { lat, lng };
  }
  return { lat: null, lng: null };
}

export function detectChildcareError(body: string): 'key' | 'rate' | 'server' | null {
  if (/INFO-100|INFO-400/.test(body)) return 'key';
  if (/INFO-300/.test(body)) return 'rate';
  if (/ERROR-100|ERROR-200/.test(body)) return 'server';
  return null;
}

export function parseChildcareXml(
  xml: string,
  fallbackArcode: string,
): NormalizedChildcare[] {
  const parsed = parseXml(xml);
  const itemNode = (parsed as any)?.response?.item;
  if (!itemNode) return [];
  const items = (Array.isArray(itemNode) ? itemNode : [itemNode]) as Record<string, unknown>[];

  const rows: NormalizedChildcare[] = [];
  for (const item of items) {
    const sourceId = pickStr(item, 'stcode');
    const name = pickStr(item, 'crname');
    if (!sourceId || !name) continue;
    const { lat, lng } = pickCoord(item);

    rows.push({
      sourceId,
      name,
      crType: pickStr(item, 'crtypename'),
      status: pickStr(item, 'crstatusname'),
      vehicleOp: pickStr(item, 'crcargbname'),
      services: pickStr(item, 'crspec'),
      sido: pickStr(item, 'sidoname'),
      sigungu: pickStr(item, 'sigunguname'),
      sigunguCode: fallbackArcode,
      zipcode: pickStr(item, 'zipcode'),
      address: pickStr(item, 'craddr') ?? '',
      tel: pickStr(item, 'crtelno'),
      fax: pickStr(item, 'crfaxno'),
      homepage: pickStr(item, 'crhome'),
      repName: pickStr(item, 'crrepname'),
      lat,
      lng,
      roomCount: pickInt(item, 'nrtrroomcnt'),
      roomSize: pickInt(item, 'nrtrroomsize'),
      playgroundCount: pickInt(item, 'plgrdco'),
      cctvCount: pickInt(item, 'cctvinstlcnt'),
      staffCount: pickInt(item, 'chcrtescnt'),
      capacity: pickInt(item, 'crcapat'),
      currentCount: pickInt(item, 'crchcnt'),
      confirmDate: pickDate(item, 'crcnfmdt'),
      pauseBeginDate: pickDate(item, 'crpausebegindt'),
      pauseEndDate: pickDate(item, 'crpauseenddt'),
      abolishDate: pickDate(item, 'crabldt'),
      dataStdDate: pickDate(item, 'datastdrdt'),
      classCnt00: pickInt(item, 'class_cnt_00'),
      classCnt01: pickInt(item, 'class_cnt_01'),
      classCnt02: pickInt(item, 'class_cnt_02'),
      classCnt03: pickInt(item, 'class_cnt_03'),
      classCnt04: pickInt(item, 'class_cnt_04'),
      classCnt05: pickInt(item, 'class_cnt_05'),
      classCntM2: pickInt(item, 'class_cnt_m2'),
      classCntM3: pickInt(item, 'class_cnt_m3'),
      classCntM5: pickInt(item, 'class_cnt_m5'),
      classCntSp: pickInt(item, 'class_cnt_sp'),
      classCntTot: pickInt(item, 'class_cnt_tot'),
      childCnt00: pickInt(item, 'child_cnt_00'),
      childCnt01: pickInt(item, 'child_cnt_01'),
      childCnt02: pickInt(item, 'child_cnt_02'),
      childCnt03: pickInt(item, 'child_cnt_03'),
      childCnt04: pickInt(item, 'child_cnt_04'),
      childCnt05: pickInt(item, 'child_cnt_05'),
      childCntM2: pickInt(item, 'child_cnt_m2'),
      childCntM3: pickInt(item, 'child_cnt_m3'),
      childCntM5: pickInt(item, 'child_cnt_m5'),
      childCntSp: pickInt(item, 'child_cnt_sp'),
      childCntTot: pickInt(item, 'child_cnt_tot'),
      emTenure0y: pickInt(item, 'em_cnt_0y'),
      emTenure1y: pickInt(item, 'em_cnt_1y'),
      emTenure2y: pickInt(item, 'em_cnt_2y'),
      emTenure4y: pickInt(item, 'em_cnt_4y'),
      emTenure6y: pickInt(item, 'em_cnt_6y'),
      emRoleDirector: pickInt(item, 'em_cnt_a1'),
      emRoleTeacher: pickInt(item, 'em_cnt_a2'),
      emRoleSpecial: pickInt(item, 'em_cnt_a3'),
      emRoleTherapy: pickInt(item, 'em_cnt_a4'),
      emRoleNutrition: pickInt(item, 'em_cnt_a5'),
      emRoleNurse: pickInt(item, 'em_cnt_a6'),
      emRoleNurseAssist: pickInt(item, 'em_cnt_a10'),
      emRoleCook: pickInt(item, 'em_cnt_a7'),
      emRoleOffice: pickInt(item, 'em_cnt_a8'),
      emRoleTot: pickInt(item, 'em_cnt_tot'),
      waitCnt00: pickInt(item, 'ew_cnt_00'),
      waitCnt01: pickInt(item, 'ew_cnt_01'),
      waitCnt02: pickInt(item, 'ew_cnt_02'),
      waitCnt03: pickInt(item, 'ew_cnt_03'),
      waitCnt04: pickInt(item, 'ew_cnt_04'),
      waitCnt05: pickInt(item, 'ew_cnt_05'),
      waitCntM6: pickInt(item, 'ew_cnt_m6'),
      waitCntTot: pickInt(item, 'ew_cnt_tot'),
    });
  }
  return rows;
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/ingest/amenities/adapter-childcare.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/amenities/adapter-childcare.ts tests/ingest/amenities/adapter-childcare.test.ts tests/ingest/amenities/fixtures/childcare-sample.xml
git commit -m "feat(ingest): cpmsapi030 파싱 함수 + 단위 테스트"
```

---

## Task 4: 수집 함수 (arcode 순회)

**Files:**
- Modify: `scripts/ingest/amenities/adapter-childcare.ts` (파일 끝에 `fetchAllChildcare` 추가)

- [ ] **Step 1: fetchAllChildcare 구현**

`adapter-childcare.ts` 끝에 추가. `Region` 테이블에서 distinct `sigunguCode`를 받아 arcode마다 1회 호출한다.

```ts
import { logger } from '@/lib/logger';

export async function fetchAllChildcare(): Promise<NormalizedChildcare[]> {
  const { env } = await import('@/lib/env');
  const { prisma } = await import('@/lib/db');
  const { fetchAmenityPage } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const key = env.CHILDCARE_API_KEY;
  if (!key) throw new Error('CHILDCARE_API_KEY is required');

  const regions = await prisma.region.findMany({
    where: { sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    select: { sigunguCode: true },
  });
  const arcodes = regions
    .map((r) => r.sigunguCode)
    .filter((c): c is string => !!c)
    .sort();

  logger.info({ arcodes: arcodes.length }, 'childcare ingest: arcode 순회 시작');

  const all: NormalizedChildcare[] = [];
  let done = 0;
  for (const arcode of arcodes) {
    const body = await fetchAmenityPage(BASE_URL, { key, arcode, stcode: '' });
    const errKind = detectChildcareError(body);
    if (errKind === 'key') throw new Error(`childcare 인증키 오류(INFO-100/400) arcode=${arcode}`);
    if (errKind === 'rate') throw new Error(`childcare 일 요청 한도 초과(INFO-300) arcode=${arcode} — 재실행 필요`);
    if (errKind === 'server') throw new Error(`childcare 서버 오류(ERROR) arcode=${arcode}`);

    const rows = parseChildcareXml(body, arcode);
    all.push(...rows);
    done++;
    if (done === 1 || done % 30 === 0) {
      logger.info({ done, total: arcodes.length, fetched: all.length }, 'childcare 진행');
    }
  }

  return enrichWithGeocode(all);
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 3: 단건 스모크 테스트 (실제 API 1회 호출)**

`.env.local`에 `CHILDCARE_API_KEY`가 설정돼 있어야 한다. 임시 inline 스크립트로 단일 arcode(서울 송파 `11710`)만 호출해 응답 형태를 눈으로 확인:

Run:
```bash
dotenv -e .env.local -- pnpm exec tsx -e "import('./scripts/ingest/amenities/adapter-childcare').then(async m => { const { fetchAmenityPage } = await import('./scripts/ingest/amenities/http'); const { env } = await import('./lib/env'); const body = await fetchAmenityPage('http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request', { key: env.CHILDCARE_API_KEY, arcode: '11710', stcode: '' }); console.log('err:', m.detectChildcareError(body)); const rows = m.parseChildcareXml(body, '11710'); console.log('rows:', rows.length); console.log(JSON.stringify(rows[0], null, 2)); });"
```
Expected: `err: null`, `rows: N`(>0), 첫 row에 name/crType/status/lat/lng가 채워져 출력. (좌표가 전부 null이면 실데이터 좌표 포맷을 재확인 — la/lo가 도분초 등 다른 단위일 가능성. 그 경우 `pickCoord` 보정 후 Task 3 테스트 추가.)

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/amenities/adapter-childcare.ts
git commit -m "feat(ingest): 시군구코드 순회 어린이집 수집 함수"
```

---

## Task 5: runner 통합 (upsert)

**Files:**
- Modify: `scripts/ingest/amenities/runner.ts`

- [ ] **Step 1: import + parseArgs 소스 목록 확장**

상단 import 묶음에 추가:

```ts
import { fetchAllChildcare } from './adapter-childcare';
```

import 타입 묶음(`NormalizedSchool` 옆)에 추가:

```ts
  NormalizedChildcare,
```

`parseArgs`의 허용 목록과 에러 메시지(2곳)에 `childcare`를 추가:

```ts
  if (!raw || !['ev-charger', 'traditional-market', 'store', 'park', 'school', 'childcare'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store, park, school, childcare. Got: ${raw}`);
  }
```

- [ ] **Step 2: main()의 분기에 childcare 추가**

`main()`의 source 분기에서 `school` 다음에 추가:

```ts
    } else if (source === 'school') {
      upserted = await ingestSchools();
    } else if (source === 'childcare') {
      upserted = await ingestChildcare();
    } else {
      upserted = await ingestStores();
    }
```

- [ ] **Step 3: ingestChildcare() 구현**

`ingestSchools()` 함수 뒤에 추가. 컬럼이 많으므로 컬럼 목록·VALUES·UPDATE를 코드로 생성한다(오타·누락 방지).

```ts
// Childcare는 컬럼이 60+개라 수동 나열 대신 정규화 row의 키로 INSERT를 구성한다.
const CHILDCARE_COLUMNS: (keyof NormalizedChildcare)[] = [
  'sourceId', 'name', 'crType', 'status', 'vehicleOp', 'services',
  'sido', 'sigungu', 'sigunguCode', 'zipcode', 'address', 'tel', 'fax',
  'homepage', 'repName',
  'roomCount', 'roomSize', 'playgroundCount', 'cctvCount', 'staffCount',
  'capacity', 'currentCount',
  'confirmDate', 'pauseBeginDate', 'pauseEndDate', 'abolishDate', 'dataStdDate',
  'classCnt00', 'classCnt01', 'classCnt02', 'classCnt03', 'classCnt04', 'classCnt05',
  'classCntM2', 'classCntM3', 'classCntM5', 'classCntSp', 'classCntTot',
  'childCnt00', 'childCnt01', 'childCnt02', 'childCnt03', 'childCnt04', 'childCnt05',
  'childCntM2', 'childCntM3', 'childCntM5', 'childCntSp', 'childCntTot',
  'emTenure0y', 'emTenure1y', 'emTenure2y', 'emTenure4y', 'emTenure6y',
  'emRoleDirector', 'emRoleTeacher', 'emRoleSpecial', 'emRoleTherapy', 'emRoleNutrition',
  'emRoleNurse', 'emRoleNurseAssist', 'emRoleCook', 'emRoleOffice', 'emRoleTot',
  'waitCnt00', 'waitCnt01', 'waitCnt02', 'waitCnt03', 'waitCnt04', 'waitCnt05',
  'waitCntM6', 'waitCntTot',
];

async function ingestChildcare(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllChildcare());
  const cols = CHILDCARE_COLUMNS.map((c) => `"${c}"`).join(', ');
  // ON CONFLICT 시 sourceId 제외 전 컬럼 갱신
  const updates = CHILDCARE_COLUMNS.filter((c) => c !== 'sourceId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r: NormalizedChildcare) => {
      const cells = CHILDCARE_COLUMNS.map((c) => Prisma.sql`${r[c] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, ${locationSql(r.lat, r.lng)}, NOW())`;
    });
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Childcare" (${Prisma.raw(cols)}, location, "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceId") DO UPDATE SET
          ${Prisma.raw(updates)},
          location = EXCLUDED.location,
          "updatedAt" = NOW()
      `,
    );
  }
  return rows.length;
}
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음. (`r[c]`는 `string|number|Date|null` 유니온 — `Prisma.sql` 바인딩 허용.)

- [ ] **Step 5: 로컬 적재 스모크 (선택, 키 있을 때)**

Run: `pnpm dotenv -e .env.local -- tsx scripts/ingest/amenities/runner.ts --source=childcare`
Expected: `childcare 진행` 로그 후 `amenity ingest done` + `IngestionRun` OK. 이어서 적재 확인:
```bash
dotenv -e .env.local -- pnpm exec tsx -e "import('./lib/db').then(async ({prisma})=>{const n=await prisma.childcare.count();const s=await prisma.childcare.findFirst({where:{status:'정상'},select:{name:true,crType:true,capacity:true,currentCount:true}});console.log({n,s});await prisma.\$disconnect();})"
```
Expected: `n` > 0, `s`에 실데이터.

> 키가 없으면 이 스텝은 건너뛰고 Task 7에서 워크플로 수동 실행으로 검증한다.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/amenities/runner.ts
git commit -m "feat(ingest): runner childcare 분기 + chunked upsert"
```

---

## Task 6: GitHub Actions 워크플로 업데이트

**Files:**
- Modify: `.github/workflows/ingest-amenities.yml`

- [ ] **Step 1: matrix·input·env에 childcare/secret 추가**

`workflow_dispatch.inputs.source.description`(9행)을 수정:

```yaml
        description: 'ev-charger | traditional-market | store | park | school | childcare'
```

matrix의 기본 소스 목록(19행)에 `childcare` 추가:

```yaml
        source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["ev-charger","traditional-market","store","school","park","childcare"]') }}
```

env 블록(NEIS_API_KEY 다음)에 추가:

```yaml
      CHILDCARE_API_KEY: ${{ secrets.CHILDCARE_API_KEY }}
```

- [ ] **Step 2: YAML 유효성 확인**

Run: `pnpm exec tsx -e "import('node:fs').then(fs=>{const s=fs.readFileSync('.github/workflows/ingest-amenities.yml','utf-8');console.log(s.includes('childcare') && s.includes('CHILDCARE_API_KEY') ? 'OK' : 'MISSING')})"`
Expected: `OK`

- [ ] **Step 3: GitHub Secret 등록 안내 (수동)**

레포 Settings → Secrets and variables → Actions에 `CHILDCARE_API_KEY` 추가(030 인증키). 이미 노출된 키는 재발급 후 등록 권장. (커밋 불필요한 외부 작업.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ingest-amenities.yml
git commit -m "ci(ingest): ingest-amenities에 childcare 소스 추가"
```

---

## Task 7: 전체 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: tsc OK (신규 에러 없음).

- [ ] **Step 2: 단위 테스트**

Run: `pnpm exec vitest run tests/ingest/amenities/adapter-childcare.test.ts`
Expected: 전부 PASS.

- [ ] **Step 3: 린트**

Run: `pnpm lint`
Expected: 신규 경고/에러 없음.

- [ ] **Step 4: (키 있을 때) 워크플로 수동 트리거 또는 로컬 적재 재확인**

`gh workflow run ingest-amenities.yml -f source=childcare` 실행 후 Actions 로그에서 성공 + `IngestionRun` OK 확인. (CHILDCARE_API_KEY secret 필요.)

---

## Self-Review

- **Spec coverage:** 030-only 수집(Task 4), 단일 Childcare 전 필드 테이블(Task 1), 폐지·휴지 status 보존(Task 3 테스트), 좌표 검증+지오코딩 폴백(Task 3/4), arcode 순회(Task 4), runner upsert(Task 5), 워크플로+secret(Task 6), 단위 테스트(Task 3) — 스펙 항목 모두 태스크에 매핑됨.
- **타입 일관성:** `NormalizedChildcare`(Task 2)의 필드명이 schema(Task 1)·parse(Task 3)·`CHILDCARE_COLUMNS`(Task 5)에서 동일하게 사용됨. 날짜는 Normalized에서 `Date | null`로 통일.
- **Placeholder:** 모든 코드 스텝에 실제 코드/명령/기대값 포함. TBD 없음.
- **리스크 메모:** 실데이터 la/lo 포맷이 십진수 도(degree)가 아닐 경우 Task 4 Step 3 스모크에서 좌표가 전부 null로 나온다 → 그때 `pickCoord` 단위 변환 보정 후 Task 3에 테스트 추가. (명세 예제값이 깨져 있어 실호출 1회로 포맷 확정이 필요.)
