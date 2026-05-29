# Parking Amenity Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국주차장정보표준데이터(`tn_pubr_prkplce_info_api`)를 공공데이터포털 XML API에서 수집해 `Parking` 테이블에 멱등 적재한다. (UI 노출은 비범위)

**Architecture:** 기존 amenity ingest 패턴을 그대로 따른다. `types.ts`에 `NormalizedParking` 추가 → `adapter-parking.ts` 신규 생성(park 어댑터 형태) → `runner.ts`에 분기/`ingestParkings`/`writeParkings` 추가 → `Parking` Prisma 모델 + 마이그레이션(PostGIS GIST 포함) → `ingest-amenities.yml` matrix 확장.

**Tech Stack:** TypeScript, Prisma (PostgreSQL + PostGIS), `fast-xml-parser`, vitest, `pnpm tsx`, GitHub Actions matrix strategy.

**Spec:** `docs/superpowers/specs/2026-05-29-parking-ingest-design.md`

---

## File Map

| 파일 | 작업 |
|---|---|
| `scripts/ingest/amenities/types.ts` | 수정 — `NormalizedParking` 추가, `AmenitySourceKey` 확장 |
| `prisma/schema.prisma` | 수정 — `Parking` 모델 추가 |
| `prisma/migrations/<ts>_add_parking/migration.sql` | 신규 — `Parking` 테이블 + PostGIS 컬럼 + GIST 인덱스 |
| `tests/ingest/amenities/fixtures/parking-sample.xml` | 신규 — 어댑터 단위 테스트 픽스처 |
| `tests/ingest/amenities/adapter-parking.test.ts` | 신규 — `parseParkingXml` 단위 테스트 |
| `scripts/ingest/amenities/adapter-parking.ts` | 신규 — XML 파싱 + `fetchAllParkings` |
| `scripts/ingest/amenities/runner.ts` | 수정 — import, `parseArgs` 화이트리스트, `ingestParkings`, `writeParkings` 추가 |
| `.github/workflows/ingest-amenities.yml` | 수정 — matrix·dispatch 옵션에 `parking` 추가 |

---

## Task 1: types.ts 확장

**Files:**
- Modify: `scripts/ingest/amenities/types.ts`

- [ ] **Step 1: `NormalizedParking` 인터페이스 추가**

`scripts/ingest/amenities/types.ts` 파일에서 `NormalizedChildcare` 인터페이스 정의 뒤(`AmenitySourceKey` 선언 직전)에 아래 블록을 추가:

```ts
export interface NormalizedParking {
  sourceId: string;
  name: string;
  prkplceSe: string | null;
  prkplceType: string | null;
  rdnmadr: string | null;
  lnmadr: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  prkcmprt: number | null;
  feedingSe: string | null;
  enforceSe: string | null;
  operDay: string | null;
  weekdayOpenHhmm: string | null;
  weekdayCloseHhmm: string | null;
  satOpenHhmm: string | null;
  satCloseHhmm: string | null;
  holidayOpenHhmm: string | null;
  holidayCloseHhmm: string | null;
  chargeInfo: string | null;
  basicTime: number | null;
  basicCharge: number | null;
  addUnitTime: number | null;
  addUnitCharge: number | null;
  dayCmmtkt: number | null;
  monthCmmtkt: number | null;
  metpay: string | null;
  spcmnt: string | null;
  pwdbsPpkZoneYn: boolean | null;
  institutionNm: string | null;
  phoneNumber: string | null;
  insttCode: string | null;
  insttNm: string | null;
  referenceDate: Date | null;
}
```

- [ ] **Step 2: `AmenitySourceKey` 및 `AMENITY_INGEST_SOURCE`에 `parking` 추가**

같은 파일의 `AmenitySourceKey` 유니언과 `AMENITY_INGEST_SOURCE` 매핑에 `parking` 한 줄씩 추가:

```ts
export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'park'
  | 'school'
  | 'childcare'
  | 'parking';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'park': 'amenity-park',
  'school': 'amenity-school',
  'childcare': 'amenity-childcare',
  'parking': 'amenity-parking',
};
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm tsc --noEmit 2>&1 | grep -E "(types\.ts|runner\.ts|adapter-parking)" | head -20`
Expected: `runner.ts`/`adapter-parking.ts` 관련 에러만 (후속 Task에서 해소). 다른 파일 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/amenities/types.ts
git commit -m "feat(amenity): add NormalizedParking type and parking source key"
```

---

## Task 2: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_parking/migration.sql`

- [ ] **Step 1: `prisma/schema.prisma` 끝에 `Parking` 모델 추가**

파일 마지막에 아래 블록 추가:

```prisma
model Parking {
  id           BigInt   @id @default(autoincrement())
  sourceId     String   @unique @db.VarChar(40)

  name         String   @db.VarChar(150)
  prkplceSe    String?  @db.VarChar(10)
  prkplceType  String?  @db.VarChar(10)

  rdnmadr      String?  @db.VarChar(200)
  lnmadr       String?  @db.VarChar(200)
  address      String   @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?

  prkcmprt     Int?
  feedingSe    String?  @db.VarChar(4)
  enforceSe    String?  @db.VarChar(20)

  operDay              String? @db.VarChar(60)
  weekdayOpenHhmm      String? @db.VarChar(5)
  weekdayCloseHhmm     String? @db.VarChar(5)
  satOpenHhmm          String? @db.VarChar(5)
  satCloseHhmm         String? @db.VarChar(5)
  holidayOpenHhmm      String? @db.VarChar(5)
  holidayCloseHhmm     String? @db.VarChar(5)

  chargeInfo    String? @db.VarChar(10)
  basicTime     Int?
  basicCharge   Int?
  addUnitTime   Int?
  addUnitCharge Int?
  dayCmmtkt     Int?
  monthCmmtkt   Int?
  metpay        String? @db.VarChar(60)
  spcmnt        String? @db.Text

  pwdbsPpkZoneYn Boolean?
  institutionNm  String? @db.VarChar(80)
  phoneNumber    String? @db.VarChar(30)
  insttCode      String? @db.VarChar(10)
  insttNm        String? @db.VarChar(80)
  referenceDate  DateTime? @db.Date

  updatedAt    DateTime @updatedAt

  @@index([prkplceSe])
  @@index([chargeInfo])
}
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm prisma migrate dev --name add_parking`
Expected: `prisma/migrations/YYYYMMDDHHMMSS_add_parking/migration.sql` 생성. 로컬 DB에 테이블 적용됨.

- [ ] **Step 3: 마이그레이션에 PostGIS 컬럼·GIST 인덱스 수동 추가**

생성된 `migration.sql` 파일 끝에 아래를 추가:

```sql
ALTER TABLE "Parking" ADD COLUMN "location" geography(Point, 4326);
CREATE INDEX IF NOT EXISTS "Parking_location_idx" ON "Parking" USING GIST ("location");
```

> 이유: Prisma는 `Unsupported("geography(...)")` 컬럼을 마이그레이션 SQL에 직접 생성하지 않는다. 기존 `school`/`park` 마이그레이션과 동일한 절차다.

- [ ] **Step 4: 마이그레이션 재적용**

Run: `pnpm prisma migrate dev`
Expected: 새 SQL이 정상 적용되고 drift 경고 없음.

- [ ] **Step 5: 테이블/인덱스 검증**

Run:
```bash
psql "$DATABASE_URL" -c '\d "Parking"' | head -60
```
Expected 포함:
- `sourceId` 컬럼 UNIQUE
- `location` 컬럼 타입 `geography(Point,4326)`
- 인덱스 `Parking_pkey`, `Parking_sourceId_key`, `Parking_prkplceSe_idx`, `Parking_chargeInfo_idx`, `Parking_location_idx` (GIST)

- [ ] **Step 6: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(amenity): add Parking model with PostGIS location"
```

---

## Task 3: 테스트 픽스처 작성

**Files:**
- Create: `tests/ingest/amenities/fixtures/parking-sample.xml`

- [ ] **Step 1: 픽스처 파일 작성**

`tests/ingest/amenities/fixtures/parking-sample.xml` 파일을 아래 내용으로 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <prkplceNo>PK-A001</prkplceNo>
        <prkplceNm>산동우항공원 공영주차장</prkplceNm>
        <prkplceSe>공영</prkplceSe>
        <prkplceType>노외</prkplceType>
        <rdnmadr>경상북도 구미시 신당4로1길 56</rdnmadr>
        <lnmadr>경상북도 구미시 산동읍 신당리 2017</lnmadr>
        <prkcmprt>233</prkcmprt>
        <feedingSe>2</feedingSe>
        <enforceSe>5부제</enforceSe>
        <operDay>평일+토요일+공휴일</operDay>
        <weekdayOperOpenHhmm>00:00</weekdayOperOpenHhmm>
        <weekdayOperColseHhmm>23:59</weekdayOperColseHhmm>
        <satOperOperOpenHhmm>00:00</satOperOperOpenHhmm>
        <satOperCloseHhmm>23:59</satOperCloseHhmm>
        <holidayOperOpenHhmm>00:00</holidayOperOpenHhmm>
        <holidayCloseOpenHhmm>23:59</holidayCloseOpenHhmm>
        <parkingchrgeInfo>유료</parkingchrgeInfo>
        <basicTime>30</basicTime>
        <basicCharge>300</basicCharge>
        <addUnitTime>10</addUnitTime>
        <addUnitCharge>100</addUnitCharge>
        <dayCmmtkt>3000</dayCmmtkt>
        <monthCmmtkt>0</monthCmmtkt>
        <metpay>신용카드</metpay>
        <spcmnt>요금면제 대상 다수</spcmnt>
        <institutionNm>구미도시공사 주차시설팀</institutionNm>
        <phoneNumber>054-480-2030</phoneNumber>
        <latitude>36.15387449</latitude>
        <longitude>128.4316946</longitude>
        <pwdbsPpkZoneYn>Y</pwdbsPpkZoneYn>
        <referenceDate>2026-04-17</referenceDate>
        <insttCode>B555076</insttCode>
        <insttNm>구미도시공사</insttNm>
      </item>
      <item>
        <prkplceNo>PK-A002</prkplceNo>
        <prkplceNm>사곡역 후문주차장</prkplceNm>
        <prkplceSe>공영</prkplceSe>
        <prkplceType>노외</prkplceType>
        <rdnmadr>경상북도 구미시 박정희로 236</rdnmadr>
        <lnmadr>경상북도 구미시 사곡동 603-349</lnmadr>
        <prkcmprt>58</prkcmprt>
        <feedingSe>1</feedingSe>
        <enforceSe>미시행</enforceSe>
        <operDay>평일+토요일+공휴일</operDay>
        <parkingchrgeInfo>무료</parkingchrgeInfo>
        <basicTime>0</basicTime>
        <basicCharge>0</basicCharge>
        <addUnitTime>0</addUnitTime>
        <addUnitCharge>0</addUnitCharge>
        <dayCmmtkt>0</dayCmmtkt>
        <monthCmmtkt>0</monthCmmtkt>
        <metpay>0</metpay>
        <spcmnt>무료 운영중</spcmnt>
        <institutionNm>구미도시공사 주차시설팀</institutionNm>
        <phoneNumber>054-480-2030</phoneNumber>
        <latitude>36.0995798</latitude>
        <longitude>128.3554192</longitude>
        <pwdbsPpkZoneYn>N</pwdbsPpkZoneYn>
        <referenceDate>2026-04-17</referenceDate>
        <insttCode>B555076</insttCode>
        <insttNm>구미도시공사</insttNm>
      </item>
      <item>
        <prkplceNo>PK-A003</prkplceNo>
        <prkplceNm>좌표없는주차장</prkplceNm>
        <prkplceSe>민영</prkplceSe>
        <rdnmadr></rdnmadr>
        <lnmadr>부산광역시 사하구 다대동 113-7</lnmadr>
        <prkcmprt></prkcmprt>
        <parkingchrgeInfo>유료</parkingchrgeInfo>
        <latitude>0</latitude>
        <longitude>0</longitude>
        <pwdbsPpkZoneYn></pwdbsPpkZoneYn>
        <referenceDate></referenceDate>
      </item>
    </items>
    <numOfRows>3</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>3</totalCount>
  </body>
</response>
```

> 픽스처는 다음 케이스를 한 번에 커버한다: 정상(PK-A001), 무료/`Y` 아님(PK-A002), 좌표 0 + 도로명 비어 지번 fallback + 숫자/날짜 누락(PK-A003).

- [ ] **Step 2: 커밋**

```bash
git add tests/ingest/amenities/fixtures/parking-sample.xml
git commit -m "test(amenity): add parking XML fixture"
```

---

## Task 4: 어댑터 파서 + 단위 테스트 (Red → Green)

**Files:**
- Create: `tests/ingest/amenities/adapter-parking.test.ts`
- Create: `scripts/ingest/amenities/adapter-parking.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/amenities/adapter-parking.test.ts` 파일 생성:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkingXml } from '@/scripts/ingest/amenities/adapter-parking';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/parking-sample.xml'),
  'utf-8',
);

describe('adapter-parking', () => {
  it('totalCount와 row 개수를 정확히 파싱한다', () => {
    const { rows, totalCount } = parseParkingXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(3);
  });

  it('정상 row 필드를 모두 정규화한다 (PK-A001)', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A001')!;
    expect(r).toBeDefined();
    expect(r.name).toBe('산동우항공원 공영주차장');
    expect(r.prkplceSe).toBe('공영');
    expect(r.prkplceType).toBe('노외');
    expect(r.address).toBe('경상북도 구미시 신당4로1길 56');
    expect(r.rdnmadr).toBe('경상북도 구미시 신당4로1길 56');
    expect(r.lnmadr).toBe('경상북도 구미시 산동읍 신당리 2017');
    expect(r.lat).toBeCloseTo(36.1538745);
    expect(r.lng).toBeCloseTo(128.4316946);
    expect(r.prkcmprt).toBe(233);
    expect(r.feedingSe).toBe('2');
    expect(r.enforceSe).toBe('5부제');
    expect(r.operDay).toBe('평일+토요일+공휴일');
    expect(r.weekdayOpenHhmm).toBe('00:00');
    expect(r.weekdayCloseHhmm).toBe('23:59');
    expect(r.satOpenHhmm).toBe('00:00');
    expect(r.satCloseHhmm).toBe('23:59');
    expect(r.holidayOpenHhmm).toBe('00:00');
    expect(r.holidayCloseHhmm).toBe('23:59');
    expect(r.chargeInfo).toBe('유료');
    expect(r.basicTime).toBe(30);
    expect(r.basicCharge).toBe(300);
    expect(r.addUnitTime).toBe(10);
    expect(r.addUnitCharge).toBe(100);
    expect(r.dayCmmtkt).toBe(3000);
    expect(r.monthCmmtkt).toBe(0);
    expect(r.metpay).toBe('신용카드');
    expect(r.spcmnt).toBe('요금면제 대상 다수');
    expect(r.pwdbsPpkZoneYn).toBe(true);
    expect(r.institutionNm).toBe('구미도시공사 주차시설팀');
    expect(r.phoneNumber).toBe('054-480-2030');
    expect(r.insttCode).toBe('B555076');
    expect(r.insttNm).toBe('구미도시공사');
    expect(r.referenceDate).toEqual(new Date(Date.UTC(2026, 3, 17)));
  });

  it('pwdbsPpkZoneYn N → false', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A002')!;
    expect(r.pwdbsPpkZoneYn).toBe(false);
    expect(r.chargeInfo).toBe('무료');
  });

  it('좌표 0/누락 → null, 도로명 빈 값이면 지번주소로 fallback, 빈 숫자/날짜는 null', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A003')!;
    expect(r).toBeDefined();
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
    expect(r.address).toBe('부산광역시 사하구 다대동 113-7');
    expect(r.rdnmadr).toBeNull();
    expect(r.lnmadr).toBe('부산광역시 사하구 다대동 113-7');
    expect(r.prkcmprt).toBeNull();
    expect(r.referenceDate).toBeNull();
    expect(r.pwdbsPpkZoneYn).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-parking.test.ts`
Expected: FAIL — `Cannot find module '@/scripts/ingest/amenities/adapter-parking'`

- [ ] **Step 3: 어댑터의 파서 부분 구현**

`scripts/ingest/amenities/adapter-parking.ts` 파일을 아래 내용으로 생성:

```ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedParking } from './types';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const PAGE_SIZE = 1000;

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coordOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function boolFromYn(v: unknown): boolean | null {
  const s = strOrNull(v);
  if (s === null) return null;
  if (s === 'Y') return true;
  if (s === 'N') return false;
  return null;
}

function parseRefDate(v: unknown): Date | null {
  const s = strOrNull(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function parseParkingXml(xml: string): {
  rows: NormalizedParking[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedParking[] = [];
  for (const item of items) {
    const sourceId = strOrNull(item.prkplceNo);
    if (!sourceId) continue;

    const rdnmadr = strOrNull(item.rdnmadr);
    const lnmadr = strOrNull(item.lnmadr);
    const address = rdnmadr ?? lnmadr ?? '';

    rows.push({
      sourceId,
      name: strOrNull(item.prkplceNm) ?? '',
      prkplceSe: strOrNull(item.prkplceSe),
      prkplceType: strOrNull(item.prkplceType),
      rdnmadr,
      lnmadr,
      address,
      lat: coordOrNull(item.latitude),
      lng: coordOrNull(item.longitude),
      prkcmprt: numOrNull(item.prkcmprt),
      feedingSe: strOrNull(item.feedingSe),
      enforceSe: strOrNull(item.enforceSe),
      operDay: strOrNull(item.operDay),
      // API 응답 필드명에 오타가 있는 채로 표준화돼 있어 그대로 매핑한다.
      weekdayOpenHhmm: strOrNull(item.weekdayOperOpenHhmm),
      weekdayCloseHhmm: strOrNull(item.weekdayOperColseHhmm),
      satOpenHhmm: strOrNull(item.satOperOperOpenHhmm),
      satCloseHhmm: strOrNull(item.satOperCloseHhmm),
      holidayOpenHhmm: strOrNull(item.holidayOperOpenHhmm),
      holidayCloseHhmm: strOrNull(item.holidayCloseOpenHhmm),
      chargeInfo: strOrNull(item.parkingchrgeInfo),
      basicTime: numOrNull(item.basicTime),
      basicCharge: numOrNull(item.basicCharge),
      addUnitTime: numOrNull(item.addUnitTime),
      addUnitCharge: numOrNull(item.addUnitCharge),
      dayCmmtkt: numOrNull(item.dayCmmtkt),
      monthCmmtkt: numOrNull(item.monthCmmtkt),
      metpay: strOrNull(item.metpay),
      spcmnt: strOrNull(item.spcmnt),
      pwdbsPpkZoneYn: boolFromYn(item.pwdbsPpkZoneYn),
      institutionNm: strOrNull(item.institutionNm),
      phoneNumber: strOrNull(item.phoneNumber),
      insttCode: strOrNull(item.insttCode),
      insttNm: strOrNull(item.insttNm),
      referenceDate: parseRefDate(item.referenceDate),
    });
  }

  return { rows, totalCount };
}

export async function fetchAllParkings(): Promise<NormalizedParking[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedParking[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
      type: 'xml',
    });
    const { rows, totalCount } = parseParkingXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-parking.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 다른 amenity 테스트 회귀 없음 확인**

Run: `pnpm vitest run tests/ingest/amenities/`
Expected: 모든 어댑터 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/adapter-parking.ts tests/ingest/amenities/adapter-parking.test.ts
git commit -m "feat(amenity): add parking adapter with XML parser and fetcher"
```

> 참고: `enrichWithGeocode`는 `lib/env`의 `PUBLIC_DATA_KEY`/`KAKAO_REST_KEY`가 없으면 no-op 또는 throw로 동작한다 — 단위 테스트는 `parseParkingXml`만 검증하므로 영향 없음. 실제 호출은 Task 7의 로컬 dry-run에서 검증한다.

---

## Task 5: runner.ts 통합

**Files:**
- Modify: `scripts/ingest/amenities/runner.ts`

- [ ] **Step 1: import / 타입 추가**

파일 상단의 import 블록에 두 줄 추가:

```ts
import { fetchAllParkings } from './adapter-parking';
```

```ts
import type {
  AmenitySourceKey,
  NormalizedEvCharger,
  NormalizedEvChargerUnit,
  NormalizedTraditionalMarket,
  NormalizedStore,
  NormalizedPark,
  NormalizedSchool,
  NormalizedChildcare,
  NormalizedParking,
} from './types';
```

- [ ] **Step 2: `parseArgs` 화이트리스트에 `parking` 추가**

`parseArgs` 함수의 `includes(raw)` 배열과 에러 메시지 양쪽에 `parking`을 추가:

```ts
function parseArgs(): { source: AmenitySourceKey } {
  const args = process.argv.slice(2);
  const raw = args.find((a) => a.startsWith('--source='))?.split('=')[1];
  if (!raw || !['ev-charger', 'traditional-market', 'store', 'park', 'school', 'childcare', 'parking'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store, park, school, childcare, parking. Got: ${raw}`);
  }
  return { source: raw as AmenitySourceKey };
}
```

- [ ] **Step 3: `main()`의 분기에 `parking` 케이스 추가**

`main()` 안의 if/else 사슬에서 `childcare` 다음, `else`(store) 직전에 `parking` 분기 삽입:

```ts
    } else if (source === 'childcare') {
      upserted = await ingestChildcare();
    } else if (source === 'parking') {
      upserted = await ingestParkings();
    } else {
      upserted = await ingestStores();
    }
```

- [ ] **Step 4: `ingestParkings` + `writeParkings` 함수 추가**

`ingestStores` 함수 정의 바로 아래(파일의 `main().catch(...)` 호출 직전)에 다음 두 함수를 추가:

```ts
const PARKING_CHUNK = 500;

async function ingestParkings(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllParkings());
  await writeParkings(rows);
  return rows.length;
}

async function writeParkings(rows: NormalizedParking[]): Promise<void> {
  for (let i = 0; i < rows.length; i += PARKING_CHUNK) {
    const chunk = rows.slice(i, i + PARKING_CHUNK);
    const values = chunk.map((r: NormalizedParking) =>
      Prisma.sql`(
        ${r.sourceId}, ${r.name},
        ${r.prkplceSe}, ${r.prkplceType},
        ${r.rdnmadr}, ${r.lnmadr}, ${r.address},
        ${locationSql(r.lat, r.lng)},
        ${r.prkcmprt}, ${r.feedingSe}, ${r.enforceSe},
        ${r.operDay},
        ${r.weekdayOpenHhmm}, ${r.weekdayCloseHhmm},
        ${r.satOpenHhmm}, ${r.satCloseHhmm},
        ${r.holidayOpenHhmm}, ${r.holidayCloseHhmm},
        ${r.chargeInfo},
        ${r.basicTime}, ${r.basicCharge},
        ${r.addUnitTime}, ${r.addUnitCharge},
        ${r.dayCmmtkt}, ${r.monthCmmtkt},
        ${r.metpay}, ${r.spcmnt},
        ${r.pwdbsPpkZoneYn}, ${r.institutionNm}, ${r.phoneNumber},
        ${r.insttCode}, ${r.insttNm}, ${r.referenceDate},
        NOW()
      )`,
    );
    await prisma.$executeRaw`
      INSERT INTO "Parking" (
        "sourceId", name,
        "prkplceSe", "prkplceType",
        rdnmadr, lnmadr, address,
        location,
        prkcmprt, "feedingSe", "enforceSe",
        "operDay",
        "weekdayOpenHhmm", "weekdayCloseHhmm",
        "satOpenHhmm", "satCloseHhmm",
        "holidayOpenHhmm", "holidayCloseHhmm",
        "chargeInfo",
        "basicTime", "basicCharge",
        "addUnitTime", "addUnitCharge",
        "dayCmmtkt", "monthCmmtkt",
        metpay, spcmnt,
        "pwdbsPpkZoneYn", "institutionNm", "phoneNumber",
        "insttCode", "insttNm", "referenceDate",
        "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        "prkplceSe" = EXCLUDED."prkplceSe",
        "prkplceType" = EXCLUDED."prkplceType",
        rdnmadr = EXCLUDED.rdnmadr,
        lnmadr = EXCLUDED.lnmadr,
        address = EXCLUDED.address,
        location = EXCLUDED.location,
        prkcmprt = EXCLUDED.prkcmprt,
        "feedingSe" = EXCLUDED."feedingSe",
        "enforceSe" = EXCLUDED."enforceSe",
        "operDay" = EXCLUDED."operDay",
        "weekdayOpenHhmm" = EXCLUDED."weekdayOpenHhmm",
        "weekdayCloseHhmm" = EXCLUDED."weekdayCloseHhmm",
        "satOpenHhmm" = EXCLUDED."satOpenHhmm",
        "satCloseHhmm" = EXCLUDED."satCloseHhmm",
        "holidayOpenHhmm" = EXCLUDED."holidayOpenHhmm",
        "holidayCloseHhmm" = EXCLUDED."holidayCloseHhmm",
        "chargeInfo" = EXCLUDED."chargeInfo",
        "basicTime" = EXCLUDED."basicTime",
        "basicCharge" = EXCLUDED."basicCharge",
        "addUnitTime" = EXCLUDED."addUnitTime",
        "addUnitCharge" = EXCLUDED."addUnitCharge",
        "dayCmmtkt" = EXCLUDED."dayCmmtkt",
        "monthCmmtkt" = EXCLUDED."monthCmmtkt",
        metpay = EXCLUDED.metpay,
        spcmnt = EXCLUDED.spcmnt,
        "pwdbsPpkZoneYn" = EXCLUDED."pwdbsPpkZoneYn",
        "institutionNm" = EXCLUDED."institutionNm",
        "phoneNumber" = EXCLUDED."phoneNumber",
        "insttCode" = EXCLUDED."insttCode",
        "insttNm" = EXCLUDED."insttNm",
        "referenceDate" = EXCLUDED."referenceDate",
        "updatedAt" = NOW()
    `;
  }
}
```

> chunk=500 근거: 컬럼 33개 + `updatedAt` 1개 = 34개/row → 500 × 34 = 17,000 바인드 변수 (PG 한도 32,767 안).

- [ ] **Step 5: 타입 체크**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Expected: 오류 없음.

- [ ] **Step 6: 다른 amenity 테스트 회귀 없음 확인**

Run: `pnpm vitest run tests/ingest/amenities/`
Expected: 모든 어댑터 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest/amenities/runner.ts
git commit -m "feat(amenity): wire parking ingest branch into runner"
```

---

## Task 6: GitHub Actions 워크플로우 확장

**Files:**
- Modify: `.github/workflows/ingest-amenities.yml`

- [ ] **Step 1: matrix·dispatch 옵션에 `parking` 추가**

`.github/workflows/ingest-amenities.yml` 파일을 아래로 교체:

```yaml
name: ingest-amenities

on:
  schedule:
    - cron: '0 2 1 * *'
  workflow_dispatch:
    inputs:
      source:
        description: 'ev-charger | traditional-market | store | park | school | childcare | parking'
        required: true
        default: 'ev-charger'

jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["ev-charger","traditional-market","store","park","school","childcare","parking"]') }}
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      NEIS_API_KEY: ${{ secrets.NEIS_API_KEY }}
      CHILDCARE_API_KEY: ${{ secrets.CHILDCARE_API_KEY }}
      KAKAO_REST_KEY: ${{ secrets.KAKAO_REST_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
      PRISMA_INGEST: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/amenities/runner.ts --source=${{ matrix.source }}
        timeout-minutes: 180
      - name: Backfill TraditionalMarket.sigunguCode
        if: matrix.source == 'traditional-market'
        run: pnpm tsx scripts/ingest/amenities/market-region-backfill.ts
        timeout-minutes: 30
```

> 변경된 부분은 (a) `workflow_dispatch.inputs.source.description`에 `parking` 추가, (b) matrix 기본 배열 끝에 `"parking"` 추가 — 두 곳뿐이다.

- [ ] **Step 2: YAML 문법 확인**

Run: `pnpm dlx js-yaml .github/workflows/ingest-amenities.yml > /dev/null`
Expected: 출력 없이 종료(파싱 성공). 에러 발생 시 따옴표/콜론 확인.

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/ingest-amenities.yml
git commit -m "ci(amenity): add parking to ingest-amenities matrix"
```

---

## Task 7: 로컬 dry-run + 멱등 재실행 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 환경 변수 확인**

Run: `grep -E '^(PUBLIC_DATA_KEY|DATABASE_URL|DIRECT_URL)=' .env.local`
Expected: 세 변수 모두 존재.

- [ ] **Step 2: 첫 dry-run 실행 (전체 18.5k 건 수집)**

Run: `pnpm tsx scripts/ingest/amenities/runner.ts --source=parking 2>&1 | tee /tmp/parking-ingest-1.log`
Expected (로그 후반부에):
- `totalCount` 값이 ~18,000–19,000 사이로 로그됨
- 마지막에 `amenity ingest done` 로그와 `upserted` 값 표시
- 에러/스택 트레이스 없음

> 예상 소요 시간 5–10분(네트워크 + 19 페이지 + upsert).

- [ ] **Step 3: row count 확인**

Run:
```bash
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "Parking";'
```
Expected: `COUNT` 값이 Step 2 로그의 `upserted` 값과 일치 (또는 dedupe로 약간 적음).

- [ ] **Step 4: 샘플 row 검증 (필드 채워짐 + 좌표)**

Run:
```bash
psql "$DATABASE_URL" -c $'SELECT name, address, "chargeInfo", "basicCharge", "addUnitCharge", "pwdbsPpkZoneYn", ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM "Parking" WHERE location IS NOT NULL ORDER BY random() LIMIT 5;'
```
Expected: 5행 모두 `name`/`address` 비어있지 않음, `lng`는 124–132 범위, `lat`은 33–39 범위(대한민국 영토 대략 범위).

- [ ] **Step 5: 두 번째 실행으로 멱등성 확인**

Run: `pnpm tsx scripts/ingest/amenities/runner.ts --source=parking 2>&1 | tee /tmp/parking-ingest-2.log`
Expected: 로그상 `upserted` 값이 Step 2와 동일.

- [ ] **Step 6: row count 불변 확인**

Run: `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "Parking";'`
Expected: Step 3 결과와 정확히 동일.

- [ ] **Step 7: PostGIS 인덱스 사용 확인 (선택)**

Run:
```bash
psql "$DATABASE_URL" -c $'EXPLAIN SELECT 1 FROM "Parking" WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(127.027,37.498),4326)::geography, 500) LIMIT 5;'
```
Expected: 실행계획에 `Index Scan` 또는 `Bitmap Index Scan` on `Parking_location_idx` 포함.

- [ ] **Step 8: IngestionRun 기록 확인**

Run:
```bash
psql "$DATABASE_URL" -c $'SELECT source, status, "rowsUpserted", "startedAt", "finishedAt" FROM "IngestionRun" WHERE source = \'amenity-parking\' ORDER BY id DESC LIMIT 3;'
```
Expected: 최근 두 건 모두 `status='OK'`, `rowsUpserted ≈ row count`, `finishedAt` not null.

> 이 Task에는 별도 커밋이 없다. 검증 전용.

---

## Self-Review

Spec 대비 빠진 항목 점검:
- [x] API endpoint·인증·페이지네이션 → Task 4 (`adapter-parking.ts`)
- [x] 스키마(33 필드) → Task 2
- [x] PostGIS 컬럼·GIST 인덱스 수동 추가 → Task 2 Step 3
- [x] `sourceId` UNIQUE upsert 키 → Task 2 / Task 5
- [x] `address = rdnmadr || lnmadr` fallback → Task 4 (`parseParkingXml`)
- [x] 좌표 0/NaN → null → Task 4 (`coordOrNull`)
- [x] `pwdbsPpkZoneYn` Y/N → boolean → Task 4 (`boolFromYn`)
- [x] `referenceDate` YYYY-MM-DD 파싱 → Task 4 (`parseRefDate`)
- [x] dedupe → upsert → Task 5 (`dedupeBySourceId` 재사용)
- [x] chunk 500 (bind 변수 한도) → Task 5
- [x] GitHub Actions matrix·dispatch 옵션 확장 → Task 6
- [x] cron / secrets / timeout 유지 → Task 6
- [x] 로컬 dry-run + 멱등 재실행 → Task 7
- [x] 비범위(LIST/DETAIL, 단지 상세 카드, sigunguCode backfill) → 명시적으로 작업에서 제외

타입 일관성:
- `NormalizedParking` 필드명이 Task 1·4·5 모두에서 동일
- DB 컬럼명(`prkcmprt`, `chargeInfo`, `pwdbsPpkZoneYn` 등)이 Task 2 schema·Task 5 INSERT 모두에서 동일
- API 응답 필드 오타(`weekdayOperColseHhmm`, `satOperOperOpenHhmm`, `holidayCloseOpenHhmm`)는 Task 3 픽스처와 Task 4 어댑터가 같은 철자 사용

placeholder/TODO: 없음.
