# School & Park Amenity Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국초중등학교위치표준데이터·전국도시공원정보표준데이터를 공공데이터포털 XML API에서 수집해 DB에 적재한다.

**Architecture:** 기존 amenity ingest 패턴을 그대로 따른다. `types.ts`에 인터페이스 추가 → 어댑터 파일 2개 신규 생성 → `runner.ts` 분기 추가 → Prisma 모델 추가 → GitHub Actions matrix 확장.

**Tech Stack:** TypeScript, Prisma (PostgreSQL + PostGIS), `fast-xml-parser`, `pnpm tsx`, GitHub Actions matrix strategy

---

## File Map

| 파일 | 작업 |
|---|---|
| `scripts/ingest/amenities/types.ts` | 수정 — NormalizedSchool, NormalizedPark 추가, AmenitySourceKey 확장 |
| `prisma/schema.prisma` | 수정 — School, Park 모델 추가 |
| `scripts/ingest/amenities/adapter-school.ts` | 신규 — 학교 XML 파싱 + fetch |
| `scripts/ingest/amenities/adapter-park.ts` | 신규 — 공원 XML 파싱 + fetch |
| `scripts/ingest/amenities/runner.ts` | 수정 — school/park import 및 ingest 함수 추가 |
| `.github/workflows/ingest-amenities.yml` | 수정 — matrix에 school, park 추가 |
| `tests/ingest/amenities/fixtures/school-sample.xml` | 신규 — 학교 테스트 픽스처 |
| `tests/ingest/amenities/fixtures/park-sample.xml` | 신규 — 공원 테스트 픽스처 |
| `tests/ingest/amenities/adapter-school.test.ts` | 신규 — 학교 어댑터 파싱 테스트 |
| `tests/ingest/amenities/adapter-park.test.ts` | 신규 — 공원 어댑터 파싱 테스트 |

---

## 사전 작업: API 필드명 확인

실제 API 응답 필드명은 구현 전 공공데이터포털에서 확인한다. 아래는 표준 명칭 기준 예상값이며, 실 응답과 다를 경우 어댑터·픽스처를 응답에 맞게 조정한다.

**학교 (전국초중등학교위치표준데이터)**
- 서비스 URL: `https://apis.data.go.kr/1741000/baseSchoolInfo/getBaseSchoolList`
- 예상 필드: `schoolId`, `schoolNm`, `rdnmadr`, `latitude`, `longitude`, `schlSe`, `fondScCd`
- `schlSe` 값: `초등학교` / `중학교` / `고등학교`
- `fondScCd` 값: `국립` / `공립` / `사립`

**공원 (전국도시공원정보표준데이터)**
- 서비스 URL: `https://apis.data.go.kr/1613000/NatUrPkInfoService/getNatUrPkInfo`
- 예상 필드: `parkId`, `parkNm`, `rdnmadr`, `latitude`, `longitude`, `parkSe`, `parkAr`
- `parkSe` 값: `근린공원` / `어린이공원` / `체육공원` / `도시자연공원` 등

> 확인 방법: PUBLIC_DATA_KEY로 `pageNo=1&numOfRows=1` 호출 후 XML 응답 필드명 확인

---

## Task 1: types.ts 확장

**Files:**
- Modify: `scripts/ingest/amenities/types.ts`

- [ ] **Step 1: NormalizedSchool, NormalizedPark 인터페이스 및 소스키 추가**

`scripts/ingest/amenities/types.ts` 파일 전체를 아래로 교체:

```ts
// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  chargeSpeed: string;
  chargerCount: number;
  operatorName: string | null;
}

export interface NormalizedTraditionalMarket {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  marketType: string | null;
}

export interface NormalizedStore {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  industryCode: string | null;
  industryName: string | null;
  sigunguCode: string;
}

export interface NormalizedSchool {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  schoolLevel: string;       // "초등학교" | "중학교" | "고등학교"
  schoolType: string | null; // "국립" | "공립" | "사립"
}

export interface NormalizedPark {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  parkType: string | null;
  area: number | null;
}

export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'school'
  | 'park';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'school': 'amenity-school',
  'park': 'amenity-park',
};
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음 (또는 runner.ts에서 school/park 미구현 관련 오류만)

- [ ] **Step 3: 커밋**

```bash
git add scripts/ingest/amenities/types.ts
git commit -m "feat(amenity): extend AmenitySourceKey with school and park types"
```

---

## Task 2: Prisma 스키마 및 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: schema.prisma에 School, Park 모델 추가**

`prisma/schema.prisma` 파일 끝에 아래 내용 추가:

```prisma
model School {
  id          BigInt                                @id @default(autoincrement())
  sourceId    String                                @unique @db.VarChar(80)
  name        String                                @db.VarChar(100)
  address     String                                @db.VarChar(200)
  location    Unsupported("geography(Point,4326)")?
  schoolLevel String                                @db.VarChar(10)
  schoolType  String?                               @db.VarChar(20)
  updatedAt   DateTime                              @updatedAt

  @@index([schoolLevel])
}

model Park {
  id        BigInt                                @id @default(autoincrement())
  sourceId  String                                @unique @db.VarChar(80)
  name      String                                @db.VarChar(100)
  address   String                                @db.VarChar(200)
  location  Unsupported("geography(Point,4326)")?
  parkType  String?                               @db.VarChar(40)
  area      Float?
  updatedAt DateTime                              @updatedAt

  @@index([parkType])
}
```

- [ ] **Step 2: 마이그레이션 생성**

```bash
pnpm prisma migrate dev --name add_school_park
```

Expected: `prisma/migrations/YYYYMMDDHHMMSS_add_school_park/migration.sql` 생성

- [ ] **Step 3: 마이그레이션 파일에 PostGIS GIST 인덱스 수동 추가**

생성된 `migration.sql` 파일 끝에 아래 두 줄 추가:

```sql
CREATE INDEX IF NOT EXISTS "School_location_idx" ON "School" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Park_location_idx" ON "Park" USING GIST ("location");
```

그 다음 마이그레이션 재적용:

```bash
pnpm prisma migrate dev
```

Expected: Already applied (변경 없음) 또는 인덱스 생성 확인

- [ ] **Step 4: Prisma 클라이언트 재생성**

```bash
pnpm prisma generate
```

Expected: `Generated Prisma Client` 출력

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(amenity): add School and Park prisma models with PostGIS indexes"
```

---

## Task 3: adapter-school.ts (TDD)

**Files:**
- Create: `tests/ingest/amenities/fixtures/school-sample.xml`
- Create: `tests/ingest/amenities/adapter-school.test.ts`
- Create: `scripts/ingest/amenities/adapter-school.ts`

> **주의**: 아래 XML 필드명(`schoolId`, `schoolNm`, `rdnmadr`, `latitude`, `longitude`, `schlSe`, `fondScCd`)은 실제 API 응답 기준으로 조정 필요. 실 API 응답과 다를 경우 픽스처·어댑터를 함께 수정한다.

- [ ] **Step 1: 픽스처 XML 작성**

`tests/ingest/amenities/fixtures/school-sample.xml` 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <schoolId>SC001</schoolId>
        <schoolNm>서울초등학교</schoolNm>
        <rdnmadr>서울특별시 종로구 창경궁로 1</rdnmadr>
        <latitude>37.570000</latitude>
        <longitude>126.990000</longitude>
        <schlSe>초등학교</schlSe>
        <fondScCd>공립</fondScCd>
      </item>
      <item>
        <schoolId>SC002</schoolId>
        <schoolNm>한국중학교</schoolNm>
        <rdnmadr>서울특별시 중구 세종대로 1</rdnmadr>
        <latitude>37.560000</latitude>
        <longitude>126.980000</longitude>
        <schlSe>중학교</schlSe>
        <fondScCd>사립</fondScCd>
      </item>
      <item>
        <schoolId>SC003</schoolId>
        <schoolNm>좌표없는학교</schoolNm>
        <rdnmadr>서울특별시 강남구 테헤란로 1</rdnmadr>
        <latitude>0</latitude>
        <longitude>0</longitude>
        <schlSe>고등학교</schlSe>
        <fondScCd>공립</fondScCd>
      </item>
    </items>
    <totalCount>3</totalCount>
  </body>
</response>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/ingest/amenities/adapter-school.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSchoolXml } from '@/scripts/ingest/amenities/adapter-school';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/school-sample.xml'),
  'utf-8',
);

describe('adapter-school', () => {
  it('좌표 있는 항목만 파싱한다', () => {
    const { rows, totalCount } = parseSchoolXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2);
  });

  it('서울초등학교 파싱 결과', () => {
    const { rows } = parseSchoolXml(xml);
    const school = rows.find((r) => r.sourceId === 'SC001');
    expect(school).toBeDefined();
    expect(school!.name).toBe('서울초등학교');
    expect(school!.address).toBe('서울특별시 종로구 창경궁로 1');
    expect(school!.schoolLevel).toBe('초등학교');
    expect(school!.schoolType).toBe('공립');
    expect(school!.lat).toBeCloseTo(37.57);
    expect(school!.lng).toBeCloseTo(126.99);
  });

  it('schoolType 없는 경우 null 처리', () => {
    const xmlNoType = xml.replace('<fondScCd>공립</fondScCd>', '');
    const { rows } = parseSchoolXml(xmlNoType);
    const school = rows.find((r) => r.sourceId === 'SC001');
    expect(school!.schoolType).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-school.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/scripts/ingest/amenities/adapter-school'`

- [ ] **Step 4: adapter-school.ts 구현**

`scripts/ingest/amenities/adapter-school.ts` 생성:

```ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedSchool } from './types';

const BASE_URL = 'https://apis.data.go.kr/1741000/baseSchoolInfo/getBaseSchoolList';
const PAGE_SIZE = 1000;

export function parseSchoolXml(xml: string): {
  rows: NormalizedSchool[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedSchool[] = [];
  for (const item of items) {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    if (!lat || !lng) continue;

    const sourceId = String(item.schoolId ?? '').trim();
    if (!sourceId) continue;

    rows.push({
      sourceId,
      name: String(item.schoolNm ?? '').trim(),
      address: String(item.rdnmadr ?? '').trim(),
      lat,
      lng,
      schoolLevel: String(item.schlSe ?? '').trim(),
      schoolType: item.fondScCd ? String(item.fondScCd).trim() : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllSchools(): Promise<NormalizedSchool[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedSchool[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseSchoolXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-school.test.ts 2>&1 | tail -10
```

Expected: PASS — 3 tests passed

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/adapter-school.ts \
        tests/ingest/amenities/adapter-school.test.ts \
        tests/ingest/amenities/fixtures/school-sample.xml
git commit -m "feat(amenity): add school adapter with tests"
```

---

## Task 4: adapter-park.ts (TDD)

**Files:**
- Create: `tests/ingest/amenities/fixtures/park-sample.xml`
- Create: `tests/ingest/amenities/adapter-park.test.ts`
- Create: `scripts/ingest/amenities/adapter-park.ts`

> **주의**: 아래 XML 필드명(`parkId`, `parkNm`, `rdnmadr`, `latitude`, `longitude`, `parkSe`, `parkAr`)은 실제 API 응답 기준으로 조정 필요.

- [ ] **Step 1: 픽스처 XML 작성**

`tests/ingest/amenities/fixtures/park-sample.xml` 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <parkId>PK001</parkId>
        <parkNm>남산공원</parkNm>
        <rdnmadr>서울특별시 중구 삼일대로 231</rdnmadr>
        <latitude>37.550000</latitude>
        <longitude>126.988000</longitude>
        <parkSe>근린공원</parkSe>
        <parkAr>2950000</parkAr>
      </item>
      <item>
        <parkId>PK002</parkId>
        <parkNm>어린이대공원</parkNm>
        <rdnmadr>서울특별시 광진구 능동로 216</rdnmadr>
        <latitude>37.548000</latitude>
        <longitude>127.074000</longitude>
        <parkSe>어린이공원</parkSe>
        <parkAr>530000</parkAr>
      </item>
      <item>
        <parkId>PK003</parkId>
        <parkNm>좌표없는공원</parkNm>
        <rdnmadr>서울특별시 강남구 테헤란로 1</rdnmadr>
        <latitude>0</latitude>
        <longitude>0</longitude>
        <parkSe>체육공원</parkSe>
        <parkAr>10000</parkAr>
      </item>
    </items>
    <totalCount>3</totalCount>
  </body>
</response>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/ingest/amenities/adapter-park.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkXml } from '@/scripts/ingest/amenities/adapter-park';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/park-sample.xml'),
  'utf-8',
);

describe('adapter-park', () => {
  it('좌표 있는 항목만 파싱한다', () => {
    const { rows, totalCount } = parseParkXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2);
  });

  it('남산공원 파싱 결과', () => {
    const { rows } = parseParkXml(xml);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park).toBeDefined();
    expect(park!.name).toBe('남산공원');
    expect(park!.address).toBe('서울특별시 중구 삼일대로 231');
    expect(park!.parkType).toBe('근린공원');
    expect(park!.area).toBe(2950000);
    expect(park!.lat).toBeCloseTo(37.55);
    expect(park!.lng).toBeCloseTo(126.988);
  });

  it('parkType 없는 경우 null 처리', () => {
    const xmlNoType = xml.replace('<parkSe>근린공원</parkSe>', '');
    const { rows } = parseParkXml(xmlNoType);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.parkType).toBeNull();
  });

  it('면적 없는 경우 null 처리', () => {
    const xmlNoArea = xml.replace('<parkAr>2950000</parkAr>', '');
    const { rows } = parseParkXml(xmlNoArea);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.area).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-park.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/scripts/ingest/amenities/adapter-park'`

- [ ] **Step 4: adapter-park.ts 구현**

`scripts/ingest/amenities/adapter-park.ts` 생성:

```ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedPark } from './types';

const BASE_URL = 'https://apis.data.go.kr/1613000/NatUrPkInfoService/getNatUrPkInfo';
const PAGE_SIZE = 1000;

export function parseParkXml(xml: string): {
  rows: NormalizedPark[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedPark[] = [];
  for (const item of items) {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    if (!lat || !lng) continue;

    const sourceId = String(item.parkId ?? '').trim();
    if (!sourceId) continue;

    const rawArea = item.parkAr;
    const area =
      rawArea !== undefined && rawArea !== null && rawArea !== ''
        ? Number(rawArea) || null
        : null;

    rows.push({
      sourceId,
      name: String(item.parkNm ?? '').trim(),
      address: String(item.rdnmadr ?? '').trim(),
      lat,
      lng,
      parkType: item.parkSe ? String(item.parkSe).trim() : null,
      area,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllParks(): Promise<NormalizedPark[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedPark[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseParkXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-park.test.ts 2>&1 | tail -10
```

Expected: PASS — 4 tests passed

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/adapter-park.ts \
        tests/ingest/amenities/adapter-park.test.ts \
        tests/ingest/amenities/fixtures/park-sample.xml
git commit -m "feat(amenity): add park adapter with tests"
```

---

## Task 5: runner.ts 업데이트

**Files:**
- Modify: `scripts/ingest/amenities/runner.ts`

- [ ] **Step 1: import 추가 및 parseArgs 확장**

`runner.ts` 상단 import 블록에 추가:

```ts
import { fetchAllSchools } from './adapter-school';
import { fetchAllParks } from './adapter-park';
```

`parseArgs` 함수의 유효성 검사 배열 수정:

```ts
// 변경 전
if (!raw || !['ev-charger', 'traditional-market', 'store'].includes(raw)) {
  throw new Error(`--source must be one of: ev-charger, traditional-market, store. Got: ${raw}`);
}

// 변경 후
if (!raw || !['ev-charger', 'traditional-market', 'store', 'school', 'park'].includes(raw)) {
  throw new Error(`--source must be one of: ev-charger, traditional-market, store, school, park. Got: ${raw}`);
}
```

- [ ] **Step 2: main() 분기 추가**

`main()` 함수 내 else 분기 앞에 추가:

```ts
// 변경 전
} else {
  upserted = await ingestStores();
}

// 변경 후
} else if (source === 'school') {
  upserted = await ingestSchools();
} else if (source === 'park') {
  upserted = await ingestParks();
} else {
  upserted = await ingestStores();
}
```

- [ ] **Step 3: ingestSchools, ingestParks 함수 추가**

`runner.ts` 파일 끝 `main().catch(...)` 직전에 추가:

```ts
async function ingestSchools(): Promise<number> {
  const rows = await fetchAllSchools();
  let upserted = 0;
  for (const row of rows) {
    await prisma.school.upsert({
      where: { sourceId: row.sourceId },
      create: {
        sourceId: row.sourceId,
        name: row.name,
        address: row.address,
        schoolLevel: row.schoolLevel,
        schoolType: row.schoolType,
      },
      update: {
        name: row.name,
        address: row.address,
        schoolLevel: row.schoolLevel,
        schoolType: row.schoolType,
      },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "School"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestParks(): Promise<number> {
  const rows = await fetchAllParks();
  let upserted = 0;
  for (const row of rows) {
    await prisma.park.upsert({
      where: { sourceId: row.sourceId },
      create: {
        sourceId: row.sourceId,
        name: row.name,
        address: row.address,
        parkType: row.parkType,
        area: row.area,
      },
      update: {
        name: row.name,
        address: row.address,
        parkType: row.parkType,
        area: row.area,
      },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "Park"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음

- [ ] **Step 5: 기존 amenity 테스트 전체 통과 확인**

```bash
pnpm vitest run tests/ingest/amenities/ 2>&1 | tail -10
```

Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/runner.ts
git commit -m "feat(amenity): add school and park ingest to runner"
```

---

## Task 6: GitHub Actions 워크플로우 업데이트

**Files:**
- Modify: `.github/workflows/ingest-amenities.yml`

- [ ] **Step 1: matrix 소스 목록 및 description 수정**

`.github/workflows/ingest-amenities.yml`의 `inputs.source.description`과 matrix 부분 수정:

```yaml
# inputs 변경 전
inputs:
  source:
    description: 'ev-charger | traditional-market | store'
    required: true
    default: 'ev-charger'

# inputs 변경 후
inputs:
  source:
    description: 'ev-charger | traditional-market | store | school | park'
    required: true
    default: 'ev-charger'
```

```yaml
# matrix 변경 전
matrix:
  source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["ev-charger","traditional-market","store"]') }}

# matrix 변경 후
matrix:
  source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["ev-charger","traditional-market","store","school","park"]') }}
```

- [ ] **Step 2: 워크플로우 문법 확인**

```bash
cat .github/workflows/ingest-amenities.yml
```

Expected: `school`과 `park`이 matrix JSON 배열에 포함되어 있음 확인

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/ingest-amenities.yml
git commit -m "feat(amenity): add school and park to ingest-amenities workflow matrix"
```

---

## 최종 검증

- [ ] **전체 amenity 테스트 통과**

```bash
pnpm vitest run tests/ingest/amenities/ 2>&1 | tail -10
```

Expected: 모든 테스트 PASS (adapter-ev-charger, adapter-store, adapter-traditional-market, adapter-school, adapter-park)

- [ ] **타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음
