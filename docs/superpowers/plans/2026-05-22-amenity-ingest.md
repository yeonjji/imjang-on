# 주변 인프라 데이터 수집 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EV충전소·전통시장·소상공인 상가 데이터를 월 1회 GitHub Actions로 수집하고, 매물 상세 페이지에서 PostGIS로 근처 시설 목록을 조회한다.

**Architecture:** 데이터소스별 분리 테이블(EvCharger, TraditionalMarket, Store) + PostGIS GIST 인덱스. 기존 트랜잭션 ingest 패턴(adapter → runner → IngestionRun)을 재사용. 매물 상세 페이지는 `Promise.all`로 3개 테이블을 병렬 공간 쿼리(`ST_DWithin`).

**Tech Stack:** Prisma, PostgreSQL + PostGIS, TypeScript, tsx, GitHub Actions, vitest

---

## 파일 구조

### 생성
| 경로 | 역할 |
|---|---|
| `scripts/ingest/amenities/types.ts` | NormalizedEvCharger 등 정규화 타입, AmenityAdapter 인터페이스 |
| `scripts/ingest/amenities/http.ts` | 공공데이터 범용 fetch (retry, 페이지네이션 헬퍼) |
| `scripts/ingest/amenities/adapter-ev-charger.ts` | 한국환경공단 EV충전소 어댑터 |
| `scripts/ingest/amenities/adapter-traditional-market.ts` | 전통시장 어댑터 |
| `scripts/ingest/amenities/adapter-store.ts` | 소상공인 상가 어댑터 (시군구 단위) |
| `scripts/ingest/amenities/runner.ts` | 진입점, IngestionRun 기록, Discord 알림 |
| `.github/workflows/ingest-amenities.yml` | 월 1회 cron |
| `lib/amenity.ts` | getNearbyEvChargers / getNearbyTraditionalMarkets / getNearbyStores |
| `tests/ingest/amenities/adapter-ev-charger.test.ts` | EV충전소 어댑터 단위 테스트 |
| `tests/ingest/amenities/adapter-traditional-market.test.ts` | 전통시장 어댑터 단위 테스트 |
| `tests/ingest/amenities/adapter-store.test.ts` | 소상공인 상가 어댑터 단위 테스트 |
| `tests/ingest/amenities/fixtures/ev-charger-sample.xml` | EV충전소 API 샘플 응답 |
| `tests/ingest/amenities/fixtures/traditional-market-sample.xml` | 전통시장 API 샘플 응답 |
| `tests/ingest/amenities/fixtures/store-sample.xml` | 소상공인 API 샘플 응답 |

### 수정
| 경로 | 변경 내용 |
|---|---|
| `prisma/schema.prisma` | EvCharger, TraditionalMarket, Store 모델 추가 |

---

### Task 1: Prisma 스키마 추가 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Auto-create: `prisma/migrations/[timestamp]_add_amenity_tables/migration.sql`

- [ ] **Step 1: schema.prisma에 3개 모델 추가**

`prisma/schema.prisma` 파일 끝에 추가:

```prisma
model EvCharger {
  id           BigInt                                @id @default(autoincrement())
  sourceId     String                                @unique @db.VarChar(80)
  name         String                                @db.VarChar(100)
  address      String                                @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?
  chargeSpeed  String                                @db.VarChar(10)
  chargerCount Int
  operatorName String?                               @db.VarChar(80)
  updatedAt    DateTime                              @updatedAt

  @@index([chargeSpeed])
}

model TraditionalMarket {
  id         BigInt                                @id @default(autoincrement())
  sourceId   String                                @unique @db.VarChar(80)
  name       String                                @db.VarChar(100)
  address    String                                @db.VarChar(200)
  location   Unsupported("geography(Point,4326)")?
  marketType String?                               @db.VarChar(40)
  updatedAt  DateTime                              @updatedAt
}

model Store {
  id           BigInt                                @id @default(autoincrement())
  sourceId     String                                @unique @db.VarChar(80)
  name         String                                @db.VarChar(100)
  address      String                                @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?
  industryCode String?                               @db.VarChar(20)
  industryName String?                               @db.VarChar(60)
  sigunguCode  String                                @db.VarChar(5)
  updatedAt    DateTime                              @updatedAt

  @@index([sigunguCode])
  @@index([industryCode])
}
```

- [ ] **Step 2: 마이그레이션 파일 생성 (apply 전)**

```bash
pnpm prisma migrate dev --create-only --name add_amenity_tables
```

Expected: `prisma/migrations/[timestamp]_add_amenity_tables/migration.sql` 생성됨

- [ ] **Step 3: 마이그레이션 SQL에 PostGIS GIST 인덱스 수동 추가**

생성된 `migration.sql` 파일 끝에 아래를 추가 (Prisma가 `Unsupported` 타입의 공간 인덱스를 자동 생성하지 않음):

```sql
CREATE INDEX IF NOT EXISTS "EvCharger_location_idx"
  ON "EvCharger" USING GIST ("location");

CREATE INDEX IF NOT EXISTS "TraditionalMarket_location_idx"
  ON "TraditionalMarket" USING GIST ("location");

CREATE INDEX IF NOT EXISTS "Store_location_idx"
  ON "Store" USING GIST ("location");
```

- [ ] **Step 4: 마이그레이션 적용**

```bash
pnpm prisma migrate dev
```

Expected: `Applying migration 'add_amenity_tables'` 출력 후 완료, 오류 없음

- [ ] **Step 5: Prisma Client 재생성 확인**

```bash
pnpm prisma generate
```

Expected: `Generated Prisma Client` 출력, 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add EvCharger, TraditionalMarket, Store tables with PostGIS index"
```

---

### Task 2: Amenity 공통 타입 정의

**Files:**
- Create: `scripts/ingest/amenities/types.ts`

- [ ] **Step 1: 타입 파일 작성**

```typescript
// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  chargeSpeed: string;     // "급속" | "완속"
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

export type AmenitySourceKey = 'ev-charger' | 'traditional-market' | 'store';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
};
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/ingest/amenities/types.ts
git commit -m "feat(amenity): add normalized types for amenity ingest"
```

---

### Task 3: Amenity HTTP 유틸리티

**Files:**
- Create: `scripts/ingest/amenities/http.ts`

기존 `scripts/ingest/http.ts`는 MOLIT API 전용 파라미터(`LAWD_CD`, `DEAL_YMD`)를 하드코딩. 인프라 API는 엔드포인트와 파라미터가 달라 별도 범용 유틸이 필요.

- [ ] **Step 1: 범용 fetch 유틸 작성**

```typescript
// scripts/ingest/amenities/http.ts
import { logger } from '@/lib/logger';

const TIMEOUT_MS = 20_000;
const SLEEP_MS = 100;
const MAX_RETRIES = 3;

export async function fetchAmenityPage(
  baseUrl: string,
  params: Record<string, string | number>,
): Promise<string> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/xml,text/xml,application/json',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'amenity http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${baseUrl}`);
      }
      await sleep(SLEEP_MS);
      return await res.text();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'amenity http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

export async function fetchAllPages<T>(
  fetcher: (pageNo: number) => Promise<{ items: T[]; totalCount: number }>,
): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  while (true) {
    const { items, totalCount } = await fetcher(pageNo);
    all.push(...items);
    if (all.length >= totalCount || items.length === 0) break;
    pageNo++;
  }
  return all;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/ingest/amenities/http.ts
git commit -m "feat(amenity): add generic HTTP fetch utility for amenity APIs"
```

---

### Task 4: EV충전소 어댑터 + 테스트

**Files:**
- Create: `scripts/ingest/amenities/adapter-ev-charger.ts`
- Create: `tests/ingest/amenities/adapter-ev-charger.test.ts`
- Create: `tests/ingest/amenities/fixtures/ev-charger-sample.xml`

EV충전소 API: `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`  
응답: XML (기존 `parseXml`, `getItems`, `getTotalCount` 재사용)  
`chgerType` → chargeSpeed 매핑: `'02'` = 완속, 나머지(`01`,`03`~`07`) = 급속

API 응답은 **충전기 단위**. 동일 `statId`(충전소)의 충전기를 그룹화해 1개 `EvCharger` 행으로 저장.

- [ ] **Step 1: API 샘플 응답 확인**

실제 API를 한 번 호출해 응답 XML 필드명을 확인한다. 아래 URL에서 `YOUR_KEY`를 `PUBLIC_DATA_KEY`로 치환:

```
https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?serviceKey=YOUR_KEY&pageNo=1&numOfRows=3
```

응답 `item` 안의 필드명(`statId`, `statNm`, `addr`, `lat`, `lng`, `chgerType`, `busiNm`, `chgerId`)을 확인하고, 아래 어댑터 코드의 필드명과 맞지 않으면 수정한다.

- [ ] **Step 2: 테스트 픽스처 작성**

Step 1에서 확인한 실제 응답을 기반으로 `tests/ingest/amenities/fixtures/ev-charger-sample.xml` 작성. 최소 2개 충전소, 각 충전소에 급속/완속 충전기가 1개씩 포함되도록 작성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <statId>ST001</statId>
        <statNm>서울역 EV충전소</statNm>
        <addr>서울특별시 중구 한강대로 405</addr>
        <lat>37.555946</lat>
        <lng>126.972317</lng>
        <chgerId>01</chgerId>
        <chgerType>03</chgerType>
        <busiNm>환경부</busiNm>
      </item>
      <item>
        <statId>ST001</statId>
        <statNm>서울역 EV충전소</statNm>
        <addr>서울특별시 중구 한강대로 405</addr>
        <lat>37.555946</lat>
        <lng>126.972317</lng>
        <chgerId>02</chgerId>
        <chgerType>02</chgerType>
        <busiNm>환경부</busiNm>
      </item>
      <item>
        <statId>ST002</statId>
        <statNm>강남구청 주차장</statNm>
        <addr>서울특별시 강남구 학동로 426</addr>
        <lat>37.517235</lat>
        <lng>127.047325</lng>
        <chgerId>01</chgerId>
        <chgerType>02</chgerType>
        <busiNm>한국전력</busiNm>
      </item>
    </items>
    <totalCount>3</totalCount>
  </body>
</response>
```

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// tests/ingest/amenities/adapter-ev-charger.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvChargerXml } from '@/scripts/ingest/amenities/adapter-ev-charger';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/ev-charger-sample.xml'),
  'utf-8',
);

describe('adapter-ev-charger', () => {
  it('그룹화: 동일 statId의 충전기를 1개 행으로 합친다', () => {
    const { rows, totalCount } = parseEvChargerXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2); // ST001, ST002 각 1개
  });

  it('ST001: 급속+완속 혼합 → chargeSpeed=급속', () => {
    const { rows } = parseEvChargerXml(xml);
    const st001 = rows.find((r) => r.sourceId === 'ST001');
    expect(st001).toBeDefined();
    expect(st001!.name).toBe('서울역 EV충전소');
    expect(st001!.chargeSpeed).toBe('급속');
    expect(st001!.chargerCount).toBe(2);
    expect(st001!.lat).toBeCloseTo(37.555946);
    expect(st001!.lng).toBeCloseTo(126.972317);
    expect(st001!.operatorName).toBe('환경부');
  });

  it('ST002: 완속만 → chargeSpeed=완속', () => {
    const { rows } = parseEvChargerXml(xml);
    const st002 = rows.find((r) => r.sourceId === 'ST002');
    expect(st002!.chargeSpeed).toBe('완속');
    expect(st002!.chargerCount).toBe(1);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-ev-charger.test.ts
```

Expected: FAIL — `Cannot find module '@/scripts/ingest/amenities/adapter-ev-charger'`

- [ ] **Step 5: 어댑터 구현**

```typescript
// scripts/ingest/amenities/adapter-ev-charger.ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import { env } from '@/lib/env';
import { fetchAmenityPage, fetchAllPages } from './http';
import type { NormalizedEvCharger } from './types';

const FAST_TYPES = new Set(['01', '03', '04', '05', '06', '07']);
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const PAGE_SIZE = 9999;

function groupChargerItems(items: Record<string, unknown>[]): NormalizedEvCharger[] {
  const stationMap = new Map<string, NormalizedEvCharger>();

  for (const item of items) {
    const statId = String(item.statId ?? '').trim();
    if (!statId) continue;

    const chgerType = String(item.chgerType ?? '').trim();
    const isFast = FAST_TYPES.has(chgerType);

    if (stationMap.has(statId)) {
      const existing = stationMap.get(statId)!;
      existing.chargerCount += 1;
      if (isFast) existing.chargeSpeed = '급속';
    } else {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!lat || !lng) continue;

      stationMap.set(statId, {
        sourceId: statId,
        name: String(item.statNm ?? '').trim(),
        address: String(item.addr ?? '').trim(),
        lat,
        lng,
        chargeSpeed: isFast ? '급속' : '완속',
        chargerCount: 1,
        operatorName: item.busiNm ? String(item.busiNm).trim() : null,
      });
    }
  }

  return Array.from(stationMap.values());
}

// 테스트용: XML 문자열 → 그룹화된 NormalizedEvCharger[]
export function parseEvChargerXml(xml: string): {
  rows: NormalizedEvCharger[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);
  return { rows: groupChargerItems(items), totalCount };
}

// runner용: API 전체 페이지 수집 → 그룹화된 NormalizedEvCharger[]
export async function fetchAllEvChargers(): Promise<NormalizedEvCharger[]> {
  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const allItems: Record<string, unknown>[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, { serviceKey, pageNo, numOfRows: PAGE_SIZE });
    const parsed = parseXml(xml);
    const items = getItems(parsed) as Record<string, unknown>[];
    const totalCount = getTotalCount(parsed);
    allItems.push(...items);
    return { items, totalCount };
  });

  return groupChargerItems(allItems);
}
```

- [ ] **Step 6: 테스트 통과 확인**

테스트가 XML 파싱 함수 `parseEvChargerXml`를 사용하므로, `groupChargerItems`도 동일 로직. 테스트 파일에서 import를 `parseEvChargerXml` 대신 아래와 같이 수정:

```typescript
// tests/ingest/amenities/adapter-ev-charger.test.ts
import { parseEvChargerXml } from '@/scripts/ingest/amenities/adapter-ev-charger';
```

그리고 `parseEvChargerXml`이 XML을 받아 그룹화된 rows를 반환하도록 구현이 완료된 후:

```bash
pnpm vitest run tests/ingest/amenities/adapter-ev-charger.test.ts
```

Expected: PASS (3개 테스트 모두)

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest/amenities/adapter-ev-charger.ts \
        tests/ingest/amenities/adapter-ev-charger.test.ts \
        tests/ingest/amenities/fixtures/ev-charger-sample.xml
git commit -m "feat(amenity): add EV charger adapter with station grouping"
```

---

### Task 5: 전통시장 어댑터 + 테스트

**Files:**
- Create: `scripts/ingest/amenities/adapter-traditional-market.ts`
- Create: `tests/ingest/amenities/adapter-traditional-market.test.ts`
- Create: `tests/ingest/amenities/fixtures/traditional-market-sample.xml`

전국전통시장표준데이터 API: `https://apis.data.go.kr/1192000/ldMrktInfo/getLdMrktInfo`  
응답: XML, 전국 단일 수집 (~1,600건), 페이지네이션

- [ ] **Step 1: API 샘플 응답 확인**

아래 URL로 실제 응답을 확인해 필드명을 검증한다:

```
https://apis.data.go.kr/1192000/ldMrktInfo/getLdMrktInfo?serviceKey=YOUR_KEY&pageNo=1&numOfRows=3
```

응답 item 내 주요 필드: `mrktNm`(시장명), `rdnmAdr`(도로명주소), `la`(위도), `lo`(경도), `mrktTypNm`(시장유형) — 실제 응답에서 확인 후 불일치 시 수정.

- [ ] **Step 2: 픽스처 작성 (실제 응답 기반)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <mrktId>M001</mrktId>
        <mrktNm>광장시장</mrktNm>
        <rdnmAdr>서울특별시 종로구 창경궁로 88</rdnmAdr>
        <la>37.570180</la>
        <lo>126.999560</lo>
        <mrktTypNm>종합시장</mrktTypNm>
      </item>
      <item>
        <mrktId>M002</mrktId>
        <mrktNm>남대문시장</mrktNm>
        <rdnmAdr>서울특별시 중구 남대문시장4길 21</rdnmAdr>
        <la>37.558945</la>
        <lo>126.976662</lo>
        <mrktTypNm>종합시장</mrktTypNm>
      </item>
    </items>
    <totalCount>2</totalCount>
  </body>
</response>
```

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// tests/ingest/amenities/adapter-traditional-market.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTraditionalMarketXml } from '@/scripts/ingest/amenities/adapter-traditional-market';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/traditional-market-sample.xml'),
  'utf-8',
);

describe('adapter-traditional-market', () => {
  it('2개 시장을 파싱한다', () => {
    const { rows, totalCount } = parseTraditionalMarketXml(xml);
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('광장시장 파싱 결과', () => {
    const { rows } = parseTraditionalMarketXml(xml);
    const gwang = rows.find((r) => r.sourceId === 'M001');
    expect(gwang).toBeDefined();
    expect(gwang!.name).toBe('광장시장');
    expect(gwang!.marketType).toBe('종합시장');
    expect(gwang!.lat).toBeCloseTo(37.57018);
    expect(gwang!.lng).toBeCloseTo(126.99956);
  });

  it('좌표 없는 항목은 건너뛴다', () => {
    const xmlWithEmpty = xml.replace('<la>37.570180</la>', '<la></la>');
    const { rows } = parseTraditionalMarketXml(xmlWithEmpty);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-traditional-market.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 5: 어댑터 구현**

```typescript
// scripts/ingest/amenities/adapter-traditional-market.ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import { env } from '@/lib/env';
import { fetchAmenityPage, fetchAllPages } from './http';
import type { NormalizedTraditionalMarket } from './types';

const BASE_URL = 'https://apis.data.go.kr/1192000/ldMrktInfo/getLdMrktInfo';
const PAGE_SIZE = 1000;

export function parseTraditionalMarketXml(xml: string): {
  rows: NormalizedTraditionalMarket[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedTraditionalMarket[] = [];
  for (const item of items) {
    const lat = Number(item.la);
    const lng = Number(item.lo);
    if (!lat || !lng) continue;

    const sourceId = String(item.mrktId ?? '').trim();
    if (!sourceId) continue;

    rows.push({
      sourceId,
      name: String(item.mrktNm ?? '').trim(),
      address: String(item.rdnmAdr ?? '').trim(),
      lat,
      lng,
      marketType: item.mrktTypNm ? String(item.mrktTypNm).trim() : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllTraditionalMarkets(): Promise<NormalizedTraditionalMarket[]> {
  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedTraditionalMarket[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseTraditionalMarketXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-traditional-market.test.ts
```

Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest/amenities/adapter-traditional-market.ts \
        tests/ingest/amenities/adapter-traditional-market.test.ts \
        tests/ingest/amenities/fixtures/traditional-market-sample.xml
git commit -m "feat(amenity): add traditional market adapter"
```

---

### Task 6: 소상공인 상가 어댑터 + 테스트

**Files:**
- Create: `scripts/ingest/amenities/adapter-store.ts`
- Create: `tests/ingest/amenities/adapter-store.test.ts`
- Create: `tests/ingest/amenities/fixtures/store-sample.xml`

소상공인 상가정보 API: `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong`  
응답: XML, 시군구 단위(`divId=SD`일 때 법정동 기준) 순회, 볼륨 ~300만 건

- [ ] **Step 1: API 샘플 응답 확인**

아래 URL로 샘플 응답 확인 (11650 = 서초구):

```
https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong?serviceKey=YOUR_KEY&pageIndex=1&pageSize=3&divId=indsSclsCd&key=Q
```

응답 item 내 주요 필드: `bizesId`(사업체ID), `bizesNm`(상호명), `rdnmAdr`(도로명주소), `lon`(경도), `lat`(위도), `indsLclsCd`(대분류코드), `indsLclsNm`(대분류명), `indsMclsNm`(중분류명), `signguCd`(시군구코드) — 실제 응답에서 확인 후 수정.

- [ ] **Step 2: 픽스처 작성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <bizesId>B001</bizesId>
        <bizesNm>스타벅스 강남점</bizesNm>
        <rdnmAdr>서울특별시 강남구 테헤란로 101</rdnmAdr>
        <lon>127.027619</lon>
        <lat>37.498095</lat>
        <indsLclsCd>Q</indsLclsCd>
        <indsLclsNm>음식</indsLclsNm>
        <indsMclsNm>커피전문점/카페</indsMclsNm>
        <signguCd>11680</signguCd>
      </item>
      <item>
        <bizesId>B002</bizesId>
        <bizesNm>올리브영 역삼점</bizesNm>
        <rdnmAdr>서울특별시 강남구 역삼로 160</rdnmAdr>
        <lon>127.035432</lon>
        <lat>37.500217</lat>
        <indsLclsCd>G</indsLclsCd>
        <indsLclsNm>소매</indsLclsNm>
        <indsMclsNm>화장품/미용</indsMclsNm>
        <signguCd>11680</signguCd>
      </item>
    </items>
    <totalCount>2</totalCount>
  </body>
</response>
```

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// tests/ingest/amenities/adapter-store.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStoreXml } from '@/scripts/ingest/amenities/adapter-store';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/store-sample.xml'),
  'utf-8',
);

describe('adapter-store', () => {
  it('2개 상가를 파싱한다', () => {
    const { rows, totalCount } = parseStoreXml(xml, '11680');
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('스타벅스 파싱 결과', () => {
    const { rows } = parseStoreXml(xml, '11680');
    const sb = rows.find((r) => r.sourceId === 'B001');
    expect(sb).toBeDefined();
    expect(sb!.name).toBe('스타벅스 강남점');
    expect(sb!.industryCode).toBe('Q');
    expect(sb!.industryName).toBe('음식');
    expect(sb!.sigunguCode).toBe('11680');
    expect(sb!.lat).toBeCloseTo(37.498095);
  });

  it('좌표 없는 항목은 건너뛴다', () => {
    const xmlWithEmpty = xml.replace('<lat>37.498095</lat>', '<lat></lat>');
    const { rows } = parseStoreXml(xmlWithEmpty, '11680');
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-store.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 5: 어댑터 구현**

```typescript
// scripts/ingest/amenities/adapter-store.ts
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import { env } from '@/lib/env';
import { fetchAmenityPage, fetchAllPages } from './http';
import type { NormalizedStore } from './types';

const BASE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong';
const PAGE_SIZE = 1000;

export function parseStoreXml(
  xml: string,
  sigunguCode: string,
): {
  rows: NormalizedStore[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedStore[] = [];
  for (const item of items) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!lat || !lng) continue;

    const sourceId = String(item.bizesId ?? '').trim();
    if (!sourceId) continue;

    rows.push({
      sourceId,
      name: String(item.bizesNm ?? '').trim(),
      address: String(item.rdnmAdr ?? '').trim(),
      lat,
      lng,
      industryCode: item.indsLclsCd ? String(item.indsLclsCd).trim() : null,
      industryName: item.indsLclsNm ? String(item.indsLclsNm).trim() : null,
      sigunguCode: item.signguCd ? String(item.signguCd).trim() : sigunguCode,
    });
  }

  return { rows, totalCount };
}

export async function fetchStoresBySigungu(
  sigunguCode: string,
): Promise<NormalizedStore[]> {
  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedStore[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageIndex: pageNo,
      pageSize: PAGE_SIZE,
      divId: 'signguCd',
      key: sigunguCode,
    });
    const { rows, totalCount } = parseStoreXml(xml, sigunguCode);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm vitest run tests/ingest/amenities/adapter-store.test.ts
```

Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest/amenities/adapter-store.ts \
        tests/ingest/amenities/adapter-store.test.ts \
        tests/ingest/amenities/fixtures/store-sample.xml
git commit -m "feat(amenity): add store adapter with sigungu-based pagination"
```

---

### Task 7: Runner + GitHub Actions

**Files:**
- Create: `scripts/ingest/amenities/runner.ts`
- Create: `.github/workflows/ingest-amenities.yml`

- [ ] **Step 1: Runner 작성**

Prisma는 `Unsupported` 타입(`geography`)을 upsert에서 직접 지원하지 않는다. 패턴: 일반 필드 upsert 후 `$executeRaw`로 location 컬럼만 별도 업데이트.

```typescript
// scripts/ingest/amenities/runner.ts
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAllEvChargers } from './adapter-ev-charger';
import { fetchAllTraditionalMarkets } from './adapter-traditional-market';
import { fetchStoresBySigungu } from './adapter-store';
import { AMENITY_INGEST_SOURCE } from './types';
import type { AmenitySourceKey } from './types';

function parseArgs(): { source: AmenitySourceKey } {
  const args = process.argv.slice(2);
  const raw = args.find((a) => a.startsWith('--source='))?.split('=')[1];
  if (!raw || !['ev-charger', 'traditional-market', 'store'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store. Got: ${raw}`);
  }
  return { source: raw as AmenitySourceKey };
}

async function main() {
  const { source } = parseArgs();
  const ingestSource = AMENITY_INGEST_SOURCE[source];

  logger.info({ source }, 'amenity ingest start');

  const run = await prisma.ingestionRun.create({
    data: { source: ingestSource, targetKey: 'all', status: 'RUNNING' },
  });

  try {
    let upserted = 0;

    if (source === 'ev-charger') {
      upserted = await ingestEvChargers();
    } else if (source === 'traditional-market') {
      upserted = await ingestTraditionalMarkets();
    } else {
      upserted = await ingestStores();
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });

    const summary = { source, upserted };
    logger.info(summary, 'amenity ingest done');
    await notify('info', `amenity ingest complete: ${source}`, summary);
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    await notify('error', `amenity ingest failed: ${source}`, { err: String(err) });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function ingestEvChargers(): Promise<number> {
  const rows = await fetchAllEvChargers();
  let upserted = 0;
  for (const row of rows) {
    await prisma.evCharger.upsert({
      where: { sourceId: row.sourceId },
      create: { sourceId: row.sourceId, name: row.name, address: row.address, chargeSpeed: row.chargeSpeed, chargerCount: row.chargerCount, operatorName: row.operatorName },
      update: { name: row.name, address: row.address, chargeSpeed: row.chargeSpeed, chargerCount: row.chargerCount, operatorName: row.operatorName },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "EvCharger"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestTraditionalMarkets(): Promise<number> {
  const rows = await fetchAllTraditionalMarkets();
  let upserted = 0;
  for (const row of rows) {
    await prisma.traditionalMarket.upsert({
      where: { sourceId: row.sourceId },
      create: { sourceId: row.sourceId, name: row.name, address: row.address, marketType: row.marketType },
      update: { name: row.name, address: row.address, marketType: row.marketType },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "TraditionalMarket"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestStores(): Promise<number> {
  const sigunguRecords = await prisma.region.findMany({
    where: { level: 2, isAbolished: false },
    select: { code: true },
  });
  const sigunguCodes = [...new Set(sigunguRecords.map((r) => r.code.slice(0, 5)))];

  let upserted = 0;
  for (const sigunguCode of sigunguCodes) {
    const rows = await fetchStoresBySigungu(sigunguCode);
    for (const row of rows) {
      await prisma.store.upsert({
        where: { sourceId: row.sourceId },
        create: { sourceId: row.sourceId, name: row.name, address: row.address, industryCode: row.industryCode, industryName: row.industryName, sigunguCode: row.sigunguCode },
        update: { name: row.name, address: row.address, industryCode: row.industryCode, industryName: row.industryName, sigunguCode: row.sigunguCode },
      });
      if (row.lat && row.lng) {
        await prisma.$executeRaw`
          UPDATE "Store"
          SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
          WHERE "sourceId" = ${row.sourceId}
        `;
      }
      upserted++;
    }
    logger.info({ sigunguCode, count: rows.length }, 'store sigungu done');
  }
  return upserted;
}

main().catch((err) => {
  logger.error({ err }, 'amenity runner fatal');
  process.exit(1);
});
```

- [ ] **Step 2: GitHub Actions 워크플로우 작성**

```yaml
# .github/workflows/ingest-amenities.yml
name: ingest-amenities

on:
  schedule:
    - cron: '0 2 1 * *'
  workflow_dispatch:
    inputs:
      source:
        description: 'ev-charger | traditional-market | store'
        required: true
        default: 'ev-charger'

jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["ev-charger","traditional-market","store"]') }}
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/amenities/runner.ts --source=${{ matrix.source }}
        timeout-minutes: 60
```

- [ ] **Step 3: 커밋**

```bash
git add scripts/ingest/amenities/runner.ts .github/workflows/ingest-amenities.yml
git commit -m "feat(amenity): add runner and GitHub Actions workflow"
```

---

### Task 8: getNearby 함수 (매물 상세 페이지 연동)

**Files:**
- Create: `lib/amenity.ts`

- [ ] **Step 1: getNearby 함수 작성**

```typescript
// lib/amenity.ts
import { prisma } from '@/lib/db';

export interface NearbyEvCharger {
  id: bigint;
  name: string;
  address: string;
  chargeSpeed: string;
  chargerCount: number;
  operatorName: string | null;
  distanceMeters: number;
}

export interface NearbyTraditionalMarket {
  id: bigint;
  name: string;
  address: string;
  marketType: string | null;
  distanceMeters: number;
}

export interface NearbyStore {
  id: bigint;
  name: string;
  address: string;
  industryCode: string | null;
  industryName: string | null;
  distanceMeters: number;
}

export async function getNearbyEvChargers(
  lat: number,
  lng: number,
  radiusMeters = 500,
): Promise<NearbyEvCharger[]> {
  return prisma.$queryRaw<NearbyEvCharger[]>`
    SELECT
      id,
      name,
      address,
      "chargeSpeed",
      "chargerCount",
      "operatorName",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "EvCharger"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT 10
  `;
}

export async function getNearbyTraditionalMarkets(
  lat: number,
  lng: number,
  radiusMeters = 1000,
): Promise<NearbyTraditionalMarket[]> {
  return prisma.$queryRaw<NearbyTraditionalMarket[]>`
    SELECT
      id,
      name,
      address,
      "marketType",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "TraditionalMarket"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT 5
  `;
}

export async function getNearbyStores(
  lat: number,
  lng: number,
  radiusMeters = 300,
): Promise<NearbyStore[]> {
  return prisma.$queryRaw<NearbyStore[]>`
    SELECT
      id,
      name,
      address,
      "industryCode",
      "industryName",
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Store"
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT 10
  `;
}

export async function getNearbyAmenities(lat: number, lng: number) {
  const [chargers, markets, stores] = await Promise.all([
    getNearbyEvChargers(lat, lng),
    getNearbyTraditionalMarkets(lat, lng),
    getNearbyStores(lat, lng),
  ]);
  return { chargers, markets, stores };
}
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/amenity.ts
git commit -m "feat(amenity): add getNearby functions for property detail page"
```

---

## 완료 기준

- [ ] `pnpm vitest run tests/ingest/amenities/` → 전체 PASS
- [ ] `pnpm tsc --noEmit` → 오류 없음
- [ ] DB에 3개 테이블(EvCharger, TraditionalMarket, Store) + GIST 인덱스 존재
- [ ] GitHub Actions 워크플로우 수동 실행 시 EV충전소 데이터 수집 성공
- [ ] `getNearbyAmenities(37.517235, 127.047325)` 호출 시 결과 반환 (DB에 데이터 있을 때)
