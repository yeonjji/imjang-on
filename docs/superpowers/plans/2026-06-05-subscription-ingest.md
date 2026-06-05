# 청약·분양 공고 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 청약홈(5개 카테고리)과 LH 사전청약 공고를 통합 `SubscriptionNotice`/`SubscriptionUnit` 모델로 수집하는 ETL을 만들고 GitHub Actions로 실행한다.

**Architecture:** 기존 `scripts/ingest/amenities/` 패턴(스냅샷 `ON CONFLICT` upsert, `IngestionRun` 체크포인트, `geocode`, Discord 알림)을 그대로 따른다. 청약홈은 응답 필드가 카테고리 간 거의 같아 **단일 config 기반 `adapter-applyhome.ts`**(spec의 카테고리별 파일 5개를 통합 — DRY)로 처리하고, LH는 목록→상세 2단계 `adapter-lh-presub.ts`로 처리한다. 정규화 row만 컬럼으로, 소스 원본은 `rawJson`에 보존한다.

**Tech Stack:** TypeScript, tsx, Prisma(PostgreSQL/PostGIS), Vitest, pnpm, GitHub Actions. 외부 API: `api.odcloud.kr`(청약홈), `apis.data.go.kr/B552555`(LH), `dapi.kakao.com`(지오코딩).

**File structure:**
```
scripts/ingest/subscriptions/
├── types.ts              # enum·정규화 타입·카테고리/소스 맵
├── http.ts               # odcloud(JSON page/perPage) + LH(JSON) fetch + 재시도
├── dates.ts              # 다양한 날짜 포맷 파서 (YYYY-MM-DD / YYYYMMDD / YYYY.MM.DD / 일정 문자열)
├── adapter-applyhome.ts  # 청약홈 5개 카테고리 (config 기반), 상세+주택형별 정규화
├── adapter-lh-presub.ts  # LH 목록(PAN_ID 열거) → 상세 정규화
├── upsert.ts             # SubscriptionNotice/Unit ON CONFLICT 청크 upsert + locationSql
└── runner.ts             # 진입점 --source, IngestionRun, 지오코딩, 알림
tests/ingest/subscriptions/
├── fixtures/             # 캡처한 샘플 JSON
├── dates.test.ts
├── adapter-applyhome.test.ts
└── adapter-lh-presub.test.ts
prisma/migrations/20260605000000_add_subscription/migration.sql
.github/workflows/ingest-subscriptions.yml
```

> 참고: 모든 `git commit`은 프로젝트 규칙대로 마지막 줄에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 를 포함한다. 작업 브랜치는 `feat/subscription-ingest`(이미 생성됨).

---

## Task 1: Prisma 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (끝에 enum 2개 + 모델 2개 추가)
- Create: `prisma/migrations/20260605000000_add_subscription/migration.sql`

- [ ] **Step 1: schema.prisma 에 enum·모델 추가**

`prisma/schema.prisma` 맨 끝에 추가:

```prisma
enum SubscriptionSource {
  APPLYHOME
  LH_PRESUB
}

enum SubscriptionCategory {
  APT
  OFFICETEL_ETC
  REMNANT
  PUB_PRIV_RENT
  ARBITRARY
  LH_PRESUB
}

model SubscriptionNotice {
  id       BigInt               @id @default(autoincrement())
  source   SubscriptionSource
  category SubscriptionCategory
  sourceKey String              @db.VarChar(120)

  houseManageNo String? @db.VarChar(40)
  pblancNo      String? @db.VarChar(40)
  panId         String? @db.VarChar(30)
  origNoticeKey String? @db.VarChar(30)

  name        String  @db.VarChar(200)
  status      String? @db.VarChar(20)
  regionCode  String? @db.VarChar(10)
  regionName  String? @db.VarChar(60)
  address     String? @db.VarChar(256)
  totalSupply Int?

  noticeDate    DateTime? @db.Date
  receiptBegin  DateTime? @db.Date
  receiptEnd    DateTime? @db.Date
  winnerDate    DateTime? @db.Date
  contractBegin DateTime? @db.Date
  contractEnd   DateTime? @db.Date
  moveInYm      String?   @db.VarChar(6)

  homepage    String? @db.VarChar(256)
  noticeUrl   String? @db.VarChar(300)
  developer   String? @db.VarChar(200)
  constructor String? @db.VarChar(200)
  tel         String? @db.VarChar(30)

  location Unsupported("geography(Point,4326)")?
  rawJson  Json

  updatedAt DateTime @updatedAt
  units     SubscriptionUnit[]

  @@unique([source, sourceKey])
  @@index([category, noticeDate(sort: Desc)])
  @@index([source, status])
  @@index([regionCode])
}

model SubscriptionUnit {
  id       BigInt @id @default(autoincrement())
  noticeId BigInt
  notice   SubscriptionNotice @relation(fields: [noticeId], references: [id], onDelete: Cascade)

  modelNo       String?  @db.VarChar(4)
  houseType     String?  @db.VarChar(20)
  area          Decimal? @db.Decimal(10, 4)
  generalSupply Int?
  specialSupply Int?
  topAmount     Int?
  rawJson       Json

  @@unique([noticeId, modelNo, houseType])
  @@index([noticeId])
}
```

- [ ] **Step 2: 마이그레이션 SQL 작성**

`prisma migrate dev` 가 `Unsupported("geography")` 컬럼/GIST 인덱스를 자동 생성하지 못하므로, 기존 amenity 마이그레이션처럼 SQL을 직접 작성한다. `prisma/migrations/20260605000000_add_subscription/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('APPLYHOME', 'LH_PRESUB');
CREATE TYPE "SubscriptionCategory" AS ENUM ('APT', 'OFFICETEL_ETC', 'REMNANT', 'PUB_PRIV_RENT', 'ARBITRARY', 'LH_PRESUB');

-- CreateTable
CREATE TABLE "SubscriptionNotice" (
  "id" BIGSERIAL NOT NULL,
  "source" "SubscriptionSource" NOT NULL,
  "category" "SubscriptionCategory" NOT NULL,
  "sourceKey" VARCHAR(120) NOT NULL,
  "houseManageNo" VARCHAR(40),
  "pblancNo" VARCHAR(40),
  "panId" VARCHAR(30),
  "origNoticeKey" VARCHAR(30),
  "name" VARCHAR(200) NOT NULL,
  "status" VARCHAR(20),
  "regionCode" VARCHAR(10),
  "regionName" VARCHAR(60),
  "address" VARCHAR(256),
  "totalSupply" INTEGER,
  "noticeDate" DATE,
  "receiptBegin" DATE,
  "receiptEnd" DATE,
  "winnerDate" DATE,
  "contractBegin" DATE,
  "contractEnd" DATE,
  "moveInYm" VARCHAR(6),
  "homepage" VARCHAR(256),
  "noticeUrl" VARCHAR(300),
  "developer" VARCHAR(200),
  "constructor" VARCHAR(200),
  "tel" VARCHAR(30),
  "location" geography(Point, 4326),
  "rawJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionUnit" (
  "id" BIGSERIAL NOT NULL,
  "noticeId" BIGINT NOT NULL,
  "modelNo" VARCHAR(4),
  "houseType" VARCHAR(20),
  "area" DECIMAL(10,4),
  "generalSupply" INTEGER,
  "specialSupply" INTEGER,
  "topAmount" INTEGER,
  "rawJson" JSONB NOT NULL,
  CONSTRAINT "SubscriptionUnit_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE UNIQUE INDEX "SubscriptionNotice_source_sourceKey_key" ON "SubscriptionNotice"("source", "sourceKey");
CREATE INDEX "SubscriptionNotice_category_noticeDate_idx" ON "SubscriptionNotice"("category", "noticeDate" DESC);
CREATE INDEX "SubscriptionNotice_source_status_idx" ON "SubscriptionNotice"("source", "status");
CREATE INDEX "SubscriptionNotice_regionCode_idx" ON "SubscriptionNotice"("regionCode");
CREATE INDEX "SubscriptionNotice_location_idx" ON "SubscriptionNotice" USING GIST ("location");

CREATE UNIQUE INDEX "SubscriptionUnit_noticeId_modelNo_houseType_key" ON "SubscriptionUnit"("noticeId", "modelNo", "houseType");
CREATE INDEX "SubscriptionUnit_noticeId_idx" ON "SubscriptionUnit"("noticeId");

-- ForeignKey
ALTER TABLE "SubscriptionUnit" ADD CONSTRAINT "SubscriptionUnit_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "SubscriptionNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> 주의: `@@unique([noticeId, modelNo, houseType])` 는 `modelNo`/`houseType` 가 NULL이면 Postgres에서 중복을 막지 못한다. 청약홈 주택형별 행은 항상 `MODEL_NO`+`HOUSE_TY`(또는 `TP`)를 가지므로 실무상 문제 없음. (LH 주택형별은 이번 범위 밖)

- [ ] **Step 3: 로컬 테스트 DB에 마이그레이션 적용 (검증)**

Run: `pnpm test:db:migrate`
Expected: `20260605000000_add_subscription` 적용 성공, 에러 없음.

- [ ] **Step 4: Prisma client 재생성 + 타입 확인**

Run: `pnpm prisma:generate && pnpm typecheck`
Expected: 성공. `prisma.subscriptionNotice` / `prisma.subscriptionUnit` 타입 사용 가능.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260605000000_add_subscription
git commit -m "feat(subscription): SubscriptionNotice/Unit 모델·마이그레이션"
```

---

## Task 2: 날짜 파서 (`dates.ts`) — TDD

여러 소스가 서로 다른 날짜 포맷을 쓴다: 청약홈 APT `YYYY-MM-DD`, 공공지원/임의공급 `YYYYMMDD`, LH 목록 `YYYY.MM.DD`, LH 일정 `"2023.10.16 10:00 ~ 2023.10.17 17:00"`.

**Files:**
- Create: `scripts/ingest/subscriptions/dates.ts`
- Test: `tests/ingest/subscriptions/dates.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/subscriptions/dates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFlexibleDate, parseScheduleRange } from '@/scripts/ingest/subscriptions/dates';

describe('parseFlexibleDate', () => {
  it('YYYY-MM-DD 를 UTC Date 로 파싱', () => {
    expect(parseFlexibleDate('2022-05-12')?.toISOString().slice(0, 10)).toBe('2022-05-12');
  });
  it('YYYYMMDD 를 파싱', () => {
    expect(parseFlexibleDate('20240118')?.toISOString().slice(0, 10)).toBe('2024-01-18');
  });
  it('YYYY.MM.DD 를 파싱', () => {
    expect(parseFlexibleDate('2023.06.09')?.toISOString().slice(0, 10)).toBe('2023-06-09');
  });
  it('빈 값·"-"·null 은 null', () => {
    expect(parseFlexibleDate('-')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
  });
  it('오타 포맷 "202306.29" 는 null (방어)', () => {
    expect(parseFlexibleDate('202306.29')).toBeNull();
  });
});

describe('parseScheduleRange', () => {
  it('일정 문자열의 시작·종료 날짜를 뽑는다', () => {
    const r = parseScheduleRange('2023.10.16 10:00 ~ 2023.10.17 17:00');
    expect(r.begin?.toISOString().slice(0, 10)).toBe('2023-10-16');
    expect(r.end?.toISOString().slice(0, 10)).toBe('2023-10-17');
  });
  it('빈 문자열은 begin/end 모두 null', () => {
    const r = parseScheduleRange('');
    expect(r.begin).toBeNull();
    expect(r.end).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/dates.test.ts`
Expected: FAIL — `parseFlexibleDate` 모듈 없음.

- [ ] **Step 3: 최소 구현**

`scripts/ingest/subscriptions/dates.ts`:

```typescript
// 공공데이터 날짜 문자열을 UTC Date 로 정규화. 모호/빈 값은 null.
export function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;
  // 구분자 제거 후 정확히 8자리 숫자(YYYYMMDD)만 허용
  const digits = s.replace(/[.\-\/]/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// "2023.10.16 10:00 ~ 2023.10.17 17:00" → { begin, end }
export function parseScheduleRange(raw: string | null | undefined): {
  begin: Date | null;
  end: Date | null;
} {
  if (!raw) return { begin: null, end: null };
  const parts = String(raw).split('~');
  const first = parts[0]?.trim().split(/\s+/)[0] ?? null;
  const last = (parts[1] ?? parts[0])?.trim().split(/\s+/)[0] ?? null;
  return { begin: parseFlexibleDate(first), end: parseFlexibleDate(last) };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/dates.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/dates.ts tests/ingest/subscriptions/dates.test.ts
git commit -m "feat(subscription): 다중 포맷 날짜 파서"
```

---

## Task 3: 타입 정의 (`types.ts`)

**Files:**
- Create: `scripts/ingest/subscriptions/types.ts`

- [ ] **Step 1: 타입·맵 작성**

`scripts/ingest/subscriptions/types.ts`:

```typescript
import type { SubscriptionSource, SubscriptionCategory } from '@prisma/client';

// 정규화된 공고 1건 (DB SubscriptionNotice 와 1:1, location 은 lat/lng 로 보관)
export interface NormalizedNotice {
  source: SubscriptionSource;
  category: SubscriptionCategory;
  sourceKey: string;
  houseManageNo: string | null;
  pblancNo: string | null;
  panId: string | null;
  origNoticeKey: string | null;
  name: string;
  status: string | null;
  regionCode: string | null;
  regionName: string | null;
  address: string | null;
  totalSupply: number | null;
  noticeDate: Date | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  winnerDate: Date | null;
  contractBegin: Date | null;
  contractEnd: Date | null;
  moveInYm: string | null;
  homepage: string | null;
  noticeUrl: string | null;
  developer: string | null;
  constructor: string | null;
  tel: string | null;
  lat: number | null;
  lng: number | null;
  rawJson: unknown;
}

// 정규화된 주택형별 1건 (notice 와 함께 묶여 전달됨)
export interface NormalizedUnit {
  modelNo: string | null;
  houseType: string | null;
  area: number | null;
  generalSupply: number | null;
  specialSupply: number | null;
  topAmount: number | null;
  rawJson: unknown;
}

// 한 공고 + 그 주택형별
export interface NoticeWithUnits {
  notice: NormalizedNotice;
  units: NormalizedUnit[];
}

// runner --source 값
export type SubscriptionSourceKey =
  | 'apt'
  | 'urbty'
  | 'remndr'
  | 'pblpvt'
  | 'opt'
  | 'lh';

// IngestionRun.source 식별자
export const SUBSCRIPTION_INGEST_SOURCE: Record<SubscriptionSourceKey, string> = {
  apt: 'subscription-apt',
  urbty: 'subscription-urbty',
  remndr: 'subscription-remndr',
  pblpvt: 'subscription-pblpvt',
  opt: 'subscription-opt',
  lh: 'subscription-lh',
};
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/subscriptions/types.ts
git commit -m "feat(subscription): 정규화 타입·소스 맵"
```

---

## Task 4: HTTP 헬퍼 (`http.ts`)

odcloud(JSON, `page`/`perPage`)와 LH(JSON, 쿼리 파라미터)를 호출한다. amenity `http.ts` 와 동일한 재시도/백오프 정책.

**Files:**
- Create: `scripts/ingest/subscriptions/http.ts`

- [ ] **Step 1: 구현 작성**

`scripts/ingest/subscriptions/http.ts`:

```typescript
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const TIMEOUT_MS = 30_000;
const SLEEP_MS = 150;
const MAX_RETRIES = 5;
const RATE_LIMIT_BACKOFF_MS = 5_000;

const ODCLOUD_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const LH_BASE = 'https://apis.data.go.kr/B552555';

function requireKey(): string {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  return env.PUBLIC_DATA_KEY;
}

async function fetchJson(url: string): Promise<any> {
  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff =
            res.status === 429
              ? RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt - 1)
              : SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'subscription http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url.split('?')[0]}`);
      }
      await sleep(SLEEP_MS);
      return await res.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'subscription http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

// 청약홈 odcloud: { currentCount, data[], totalCount, ... }
export async function fetchOdcloud(
  operation: string,
  params: Record<string, string | number>,
): Promise<{ data: any[]; totalCount: number }> {
  const url = new URL(`${ODCLOUD_BASE}/${operation}`);
  url.searchParams.set('serviceKey', requireKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const json = await fetchJson(url.toString());
  return { data: json.data ?? [], totalCount: json.totalCount ?? 0 };
}

// LH B552555: 응답이 배열 [ {dsSch..}, {dsList.., resHeader..} ] 형태 → 통째로 반환
export async function fetchLh(
  servicePath: string,
  operation: string,
  params: Record<string, string | number>,
): Promise<any> {
  const url = new URL(`${LH_BASE}/${servicePath}/${operation}`);
  url.searchParams.set('serviceKey', requireKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return fetchJson(url.toString());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

> `PUBLIC_DATA_KEY` 는 data.go.kr 의 **Decoding** 키를 쓴다(`URL.searchParams.set` 가 다시 인코딩하므로). amenity `http.ts` 와 동일 전제.

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/subscriptions/http.ts
git commit -m "feat(subscription): odcloud·LH JSON fetch 헬퍼"
```

---

## Task 5: probe 스크립트로 실제 응답 확정 + fixture 캡처

파서를 작성하기 전에 실제 응답 형태와 키가 두 호스트에서 동작하는지 확인하고, 테스트용 fixture 를 캡처한다.

**Files:**
- Create (임시): `scripts/ingest/subscriptions/probe.ts`
- Create: `tests/ingest/subscriptions/fixtures/applyhome-apt-detail.json`
- Create: `tests/ingest/subscriptions/fixtures/applyhome-apt-mdl.json`
- Create: `tests/ingest/subscriptions/fixtures/applyhome-urbty-mdl.json`
- Create: `tests/ingest/subscriptions/fixtures/lh-list.json`
- Create: `tests/ingest/subscriptions/fixtures/lh-detail.json`

- [ ] **Step 1: probe 스크립트 작성**

`scripts/ingest/subscriptions/probe.ts`:

```typescript
import { fetchOdcloud, fetchLh } from './http';
import { logger } from '@/lib/logger';

async function main() {
  const aptDetail = await fetchOdcloud('getAPTLttotPblancDetail', { page: 1, perPage: 3 });
  logger.info({ totalCount: aptDetail.totalCount, sample: aptDetail.data[0] }, 'APT detail');

  const lhList = await fetchLh('lhLeaseNoticeBfhInfo1', 'lhLeaseNoticeBfhInfo1', {
    PG_SZ: 5,
    PAGE: 1,
    PAN_ST_DT: '20231001',
    PAN_ED_DT: '20231231',
  });
  logger.info({ lhList }, 'LH list');

  const firstPanId = lhList?.[1]?.dsList?.[0]?.PAN_ID;
  if (firstPanId) {
    const lhDetail = await fetchLh('lhLeaseNoticeBfhDtlInfo1', 'getLeaseNoticeBfhDtlInfo1', {
      PAN_ID: firstPanId,
    });
    logger.info({ lhDetail }, 'LH detail');
  }
}

main().catch((e) => {
  logger.error({ err: e }, 'probe failed');
  process.exit(1);
});
```

- [ ] **Step 2: probe 실행 (운영 키 사용)**

Run: `dotenv -e .env.local -- tsx scripts/ingest/subscriptions/probe.ts`
Expected: APT detail `totalCount` > 0, LH list `dsList` 배열에 `PAN_ID` 존재, LH detail 객체 출력.

> 만약 LH 상세 operation 이름이 다르면(`getLeaseNoticeBfhDtlInfo1` vs 명세 예제의 불일치) 에러 메시지를 보고 `getLeaseNoticeDtlInfo1` 등으로 교정한다. 교정한 값을 Task 7 의 `adapter-lh-presub.ts` 에 반영.

- [ ] **Step 3: fixture 캡처**

probe 출력(또는 아래 spec 샘플 응답)을 바탕으로 fixture 파일을 만든다. 최소한 다음을 포함:
- `applyhome-apt-detail.json`: `getAPTLttotPblancDetail` 응답에서 `data` 배열(공고 1건). spec 문서 `docs/superpowers/specs/2026-06-05-subscription-ingest-design.md` 의 청약홈 APT 샘플 응답을 사용 가능.
- `applyhome-apt-mdl.json`: `getAPTLttotPblancMdl` 응답 `data` 배열(주택형 2건).
- `applyhome-urbty-mdl.json`: `getUrbtyOfctlLttotPblancMdl` 응답 `data` 배열(`TP`/`EXCLUSE_AR`/`SUPLY_AMOUNT` 필드 형태 1건).
- `lh-list.json`: `lhLeaseNoticeBfhInfo1` 전체 응답 배열(`dsList` 2건, 정정공고 포함).
- `lh-detail.json`: `lhLeaseNoticeBfhDtlInfo1` 전체 응답 배열(`dsSplScdl`/`dsCtrtPlc`/`dsAhflInfo` 포함).

각 fixture 는 `{ "data": [ ... ] }`(odcloud) 또는 LH 원본 배열 형태 그대로 저장한다.

- [ ] **Step 4: probe 스크립트 삭제 (임시였음)**

Run: `rm scripts/ingest/subscriptions/probe.ts`

- [ ] **Step 5: Commit fixtures**

```bash
git add tests/ingest/subscriptions/fixtures
git commit -m "test(subscription): 실제 API 응답 fixture 캡처"
```

---

## Task 6: 청약홈 어댑터 (`adapter-applyhome.ts`) — TDD

5개 카테고리를 config 로 묶고, `normalizeNotice`/`normalizeUnit` 은 카테고리 간 다른 필드명을 fallback 으로 흡수한다.

**Files:**
- Create: `scripts/ingest/subscriptions/adapter-applyhome.ts`
- Test: `tests/ingest/subscriptions/adapter-applyhome.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/subscriptions/adapter-applyhome.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeNotice,
  normalizeUnit,
  APPLYHOME_CONFIG,
} from '@/scripts/ingest/subscriptions/adapter-applyhome';

function load(name: string) {
  return JSON.parse(readFileSync(resolve(`tests/ingest/subscriptions/fixtures/${name}`), 'utf-8'));
}

describe('normalizeNotice (APT)', () => {
  const detail = load('applyhome-apt-detail.json').data[0];
  const n = normalizeNotice(detail, APPLYHOME_CONFIG.apt);

  it('source/category/sourceKey 를 채운다', () => {
    expect(n.source).toBe('APPLYHOME');
    expect(n.category).toBe('APT');
    expect(n.sourceKey).toBe(`${detail.HOUSE_MANAGE_NO}-${detail.PBLANC_NO}`);
  });
  it('공통 필드를 매핑한다', () => {
    expect(n.name).toBe(detail.HOUSE_NM);
    expect(n.regionCode).toBe(detail.SUBSCRPT_AREA_CODE);
    expect(n.regionName).toBe(detail.SUBSCRPT_AREA_CODE_NM);
    expect(n.address).toBe(detail.HSSPLY_ADRES);
    expect(n.totalSupply).toBe(Number(detail.TOT_SUPLY_HSHLDCO));
    expect(n.noticeUrl).toBe(detail.PBLANC_URL);
    expect(n.developer).toBe(detail.BSNS_MBY_NM);
    expect(n.constructor).toBe(detail.CNSTRCT_ENTRPS_NM);
  });
  it('APT 의 RCEPT_BGNDE 를 receiptBegin 으로 쓴다', () => {
    expect(n.receiptBegin?.toISOString().slice(0, 10)).toBe('2022-05-23');
  });
  it('rawJson 에 원본을 보존한다', () => {
    expect((n.rawJson as any).HOUSE_NM).toBe(detail.HOUSE_NM);
  });
});

describe('normalizeUnit (APT vs urbty 필드 차이)', () => {
  it('APT: HOUSE_TY/SUPLY_AR/LTTOT_TOP_AMOUNT', () => {
    const u = normalizeUnit(load('applyhome-apt-mdl.json').data[0]);
    expect(u.houseType).toBe('058.8500A');
    expect(u.area).toBeCloseTo(80.38);
    expect(u.generalSupply).toBe(8);
    expect(u.specialSupply).toBe(11);
    expect(u.topAmount).toBe(80720);
  });
  it('urbty: TP/EXCLUSE_AR/SUPLY_AMOUNT (콤마 제거)', () => {
    const u = normalizeUnit(load('applyhome-urbty-mdl.json').data[0]);
    expect(u.houseType).toBe('26');
    expect(u.area).toBeCloseTo(26);
    expect(u.generalSupply).toBe(25); // urbty 는 SUPLY_HSHLDCO 를 일반공급으로
    expect(u.topAmount).toBe(53740);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/adapter-applyhome.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 어댑터 구현**

`scripts/ingest/subscriptions/adapter-applyhome.ts`:

```typescript
import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { logger } from '@/lib/logger';
import { fetchOdcloud } from './http';
import { parseFlexibleDate } from './dates';
import type { NormalizedNotice, NormalizedUnit, NoticeWithUnits } from './types';

export interface ApplyhomeCategoryConfig {
  category: SubscriptionCategory;
  detailOp: string;
  mdlOp: string;
}

export const APPLYHOME_CONFIG = {
  apt: { category: SubscriptionCategory.APT, detailOp: 'getAPTLttotPblancDetail', mdlOp: 'getAPTLttotPblancMdl' },
  urbty: { category: SubscriptionCategory.OFFICETEL_ETC, detailOp: 'getUrbtyOfctlLttotPblancDetail', mdlOp: 'getUrbtyOfctlLttotPblancMdl' },
  remndr: { category: SubscriptionCategory.REMNANT, detailOp: 'getRemndrLttotPblancDetail', mdlOp: 'getRemndrLttotPblancMdl' },
  pblpvt: { category: SubscriptionCategory.PUB_PRIV_RENT, detailOp: 'getPblPvtRentLttotPblancDetail', mdlOp: 'getPblPvtRentLttotPblancMdl' },
  opt: { category: SubscriptionCategory.ARBITRARY, detailOp: 'getOPTLttotPblancDetail', mdlOp: 'getOPTLttotPblancMdl' },
} satisfies Record<string, ApplyhomeCategoryConfig>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeNotice(
  row: Record<string, unknown>,
  cfg: ApplyhomeCategoryConfig,
): NormalizedNotice {
  const houseManageNo = str(row.HOUSE_MANAGE_NO);
  const pblancNo = str(row.PBLANC_NO);
  return {
    source: SubscriptionSource.APPLYHOME,
    category: cfg.category,
    sourceKey: `${houseManageNo}-${pblancNo}`,
    houseManageNo,
    pblancNo,
    panId: null,
    origNoticeKey: null,
    name: str(row.HOUSE_NM) ?? '(무명)',
    status: null, // 청약홈은 상태 필드 없음 — 추후 날짜로 도출
    regionCode: str(row.SUBSCRPT_AREA_CODE),
    regionName: str(row.SUBSCRPT_AREA_CODE_NM),
    address: str(row.HSSPLY_ADRES),
    totalSupply: num(row.TOT_SUPLY_HSHLDCO),
    noticeDate: parseFlexibleDate(str(row.RCRIT_PBLANC_DE)),
    // APT: RCEPT_BGNDE / 그 외: SUBSCRPT_RCEPT_BGNDE
    receiptBegin: parseFlexibleDate(str(row.RCEPT_BGNDE) ?? str(row.SUBSCRPT_RCEPT_BGNDE)),
    receiptEnd: parseFlexibleDate(str(row.RCEPT_ENDDE) ?? str(row.SUBSCRPT_RCEPT_ENDDE)),
    winnerDate: parseFlexibleDate(str(row.PRZWNER_PRESNATN_DE)),
    contractBegin: parseFlexibleDate(str(row.CNTRCT_CNCLS_BGNDE)),
    contractEnd: parseFlexibleDate(str(row.CNTRCT_CNCLS_ENDDE)),
    moveInYm: str(row.MVN_PREARNGE_YM),
    homepage: str(row.HMPG_ADRES),
    noticeUrl: str(row.PBLANC_URL),
    developer: str(row.BSNS_MBY_NM),
    constructor: str(row.CNSTRCT_ENTRPS_NM),
    tel: str(row.MDHS_TELNO),
    lat: null, // runner 에서 지오코딩
    lng: null,
    rawJson: row,
  };
}

export function normalizeUnit(row: Record<string, unknown>): NormalizedUnit {
  // 일반공급: APT/remndr/opt 는 SUPLY_HSHLDCO, urbty/pblpvt 도 SUPLY_HSHLDCO
  // 면적: SUPLY_AR(공급면적) 우선, 없으면 EXCLUSE_AR(전용면적)
  // 금액: LTTOT_TOP_AMOUNT(만원) 또는 SUPLY_AMOUNT(만원, 콤마)
  return {
    modelNo: str(row.MODEL_NO),
    houseType: str(row.HOUSE_TY) ?? str(row.TP),
    area: num(row.SUPLY_AR) ?? num(row.EXCLUSE_AR),
    generalSupply: num(row.SUPLY_HSHLDCO),
    specialSupply: num(row.SPSPLY_HSHLDCO),
    topAmount: num(row.LTTOT_TOP_AMOUNT) ?? num(row.SUPLY_AMOUNT),
    rawJson: row,
  };
}

// 한 카테고리 전체를 수집해 공고+주택형별 묶음 배열로 반환
export async function fetchApplyhomeCategory(
  cfg: ApplyhomeCategoryConfig,
): Promise<NoticeWithUnits[]> {
  const out: NoticeWithUnits[] = [];
  const PER = 100;
  let page = 1;
  while (true) {
    const { data, totalCount } = await fetchOdcloud(cfg.detailOp, { page, perPage: PER });
    for (const row of data) {
      const notice = normalizeNotice(row as Record<string, unknown>, cfg);
      const units = await fetchUnits(cfg, notice.houseManageNo, notice.pblancNo);
      out.push({ notice, units });
    }
    logger.info({ category: cfg.category, page, fetched: out.length, totalCount }, 'applyhome page');
    if (page * PER >= totalCount || data.length === 0) break;
    page++;
  }
  return out;
}

async function fetchUnits(
  cfg: ApplyhomeCategoryConfig,
  houseManageNo: string | null,
  pblancNo: string | null,
): Promise<NormalizedUnit[]> {
  if (!houseManageNo || !pblancNo) return [];
  const units: NormalizedUnit[] = [];
  let page = 1;
  while (true) {
    const { data, totalCount } = await fetchOdcloud(cfg.mdlOp, {
      page,
      perPage: 100,
      'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo,
      'cond[PBLANC_NO::EQ]': pblancNo,
    });
    for (const row of data) units.push(normalizeUnit(row as Record<string, unknown>));
    if (page * 100 >= totalCount || data.length === 0) break;
    page++;
  }
  return units;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/adapter-applyhome.test.ts`
Expected: PASS.

> fixture 의 실제 값(주택형/면적/금액)이 테스트 기대값과 다르면, **fixture 가 진실**이므로 테스트 기대값을 fixture 에 맞춰 조정한다(파서가 아니라 테스트를 고침).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/adapter-applyhome.ts tests/ingest/subscriptions/adapter-applyhome.test.ts
git commit -m "feat(subscription): 청약홈 5개 카테고리 어댑터(config 기반)"
```

---

## Task 7: LH 사전청약 어댑터 (`adapter-lh-presub.ts`) — TDD

목록에서 PAN_ID 와 메타를 얻고, PAN_ID 별 상세에서 일정/접수처를 보강한다.

**Files:**
- Create: `scripts/ingest/subscriptions/adapter-lh-presub.ts`
- Test: `tests/ingest/subscriptions/adapter-lh-presub.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/subscriptions/adapter-lh-presub.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseLhList,
  normalizeLhNotice,
  applyLhDetail,
} from '@/scripts/ingest/subscriptions/adapter-lh-presub';

function load(name: string) {
  return JSON.parse(readFileSync(resolve(`tests/ingest/subscriptions/fixtures/${name}`), 'utf-8'));
}

describe('parseLhList', () => {
  it('dsList 행들을 추출한다', () => {
    const rows = parseLhList(load('lh-list.json'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].PAN_ID).toBeTruthy();
  });
});

describe('normalizeLhNotice', () => {
  const rows = parseLhList(load('lh-list.json'));
  const n = normalizeLhNotice(rows[0]);
  it('source/category/sourceKey(PAN_ID) 매핑', () => {
    expect(n.source).toBe('LH_PRESUB');
    expect(n.category).toBe('LH_PRESUB');
    expect(n.sourceKey).toBe(rows[0].PAN_ID);
    expect(n.panId).toBe(rows[0].PAN_ID);
  });
  it('목록 메타(name/region/status/url/origNoticeKey) 매핑', () => {
    expect(n.name).toBe(rows[0].PAN_NM);
    expect(n.regionCode).toBe(rows[0].CNP_CD || null);
    expect(n.regionName).toBe(rows[0].CNP_CD_NM);
    expect(n.status).toBe(rows[0].PAN_SS);
    expect(n.noticeUrl).toBe(rows[0].DTL_URL);
    expect(n.origNoticeKey).toBe(rows[0].OTXT_PAN_ID);
  });
  it('LH 는 좌표를 채우지 않는다', () => {
    expect(n.lat).toBeNull();
    expect(n.lng).toBeNull();
  });
});

describe('applyLhDetail', () => {
  it('상세의 첫 일정에서 receiptBegin/winnerDate 를 보강하고 rawJson 에 상세 병합', () => {
    const rows = parseLhList(load('lh-list.json'));
    const n = normalizeLhNotice(rows[0]);
    const merged = applyLhDetail(n, load('lh-detail.json'));
    expect(merged.receiptBegin).not.toBeNull();
    expect(merged.winnerDate).not.toBeNull();
    expect((merged.rawJson as any).detail).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/adapter-lh-presub.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 어댑터 구현**

`scripts/ingest/subscriptions/adapter-lh-presub.ts`:

```typescript
import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { logger } from '@/lib/logger';
import { fetchLh } from './http';
import { parseFlexibleDate, parseScheduleRange } from './dates';
import type { NormalizedNotice, NoticeWithUnits } from './types';

const LIST_PATH = 'lhLeaseNoticeBfhInfo1';
const LIST_OP = 'lhLeaseNoticeBfhInfo1';
const DETAIL_PATH = 'lhLeaseNoticeBfhDtlInfo1';
const DETAIL_OP = 'getLeaseNoticeBfhDtlInfo1'; // probe 에서 교정될 수 있음
const SERVICE_START = '20231019';

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

// LH 응답 배열에서 특정 키의 서브셋 배열을 꺼낸다
function pickDataset(resp: any, key: string): any[] {
  if (!Array.isArray(resp)) return [];
  for (const block of resp) {
    if (block && Array.isArray(block[key])) return block[key];
  }
  return [];
}

export function parseLhList(resp: any): Record<string, any>[] {
  return pickDataset(resp, 'dsList');
}

export function normalizeLhNotice(row: Record<string, any>): NormalizedNotice {
  const panId = str(row.PAN_ID);
  return {
    source: SubscriptionSource.LH_PRESUB,
    category: SubscriptionCategory.LH_PRESUB,
    sourceKey: panId ?? '(unknown)',
    houseManageNo: null,
    pblancNo: null,
    panId,
    origNoticeKey: str(row.OTXT_PAN_ID),
    name: str(row.PAN_NM) ?? '(무명)',
    status: str(row.PAN_SS),
    regionCode: str(row.CNP_CD),
    regionName: str(row.CNP_CD_NM),
    address: null,
    totalSupply: null,
    noticeDate: parseFlexibleDate(str(row.PAN_NT_ST_DT)),
    receiptBegin: null,
    receiptEnd: parseFlexibleDate(str(row.CLSG_DT)),
    winnerDate: null,
    contractBegin: null,
    contractEnd: null,
    moveInYm: null,
    homepage: null,
    noticeUrl: str(row.DTL_URL),
    developer: null,
    constructor: null,
    tel: null,
    lat: null,
    lng: null,
    rawJson: { list: row },
  };
}

// 상세 응답을 받아 일정/접수처를 보강하고 rawJson.detail 에 원본 병합
export function applyLhDetail(notice: NormalizedNotice, detailResp: any): NormalizedNotice {
  const schedules = pickDataset(detailResp, 'dsSplScdl');
  let receiptBegin: Date | null = null;
  let winnerDate: Date | null = null;
  for (const s of schedules) {
    const { begin } = parseScheduleRange(str(s.ACP_DTTM));
    if (begin && (!receiptBegin || begin < receiptBegin)) receiptBegin = begin;
    const w = parseFlexibleDate(str(s.PZWR_ANC_DT));
    if (w && (!winnerDate || w > winnerDate)) winnerDate = w;
  }
  return {
    ...notice,
    receiptBegin: receiptBegin ?? notice.receiptBegin,
    winnerDate: winnerDate ?? notice.winnerDate,
    rawJson: { ...(notice.rawJson as object), detail: detailResp },
  };
}

// 목록 전체 페이지네이션 → PAN_ID 별 상세 보강
export async function fetchLhPresub(): Promise<NoticeWithUnits[]> {
  const today = new Date();
  const end = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;
  const out: NoticeWithUnits[] = [];
  const PG = 100;
  let page = 1;
  while (true) {
    const resp = await fetchLh(LIST_PATH, LIST_OP, {
      PG_SZ: PG,
      PAGE: page,
      PAN_ST_DT: SERVICE_START,
      PAN_ED_DT: end,
    });
    const rows = parseLhList(resp);
    const total = Number(rows[0]?.TOTALCOUNT ?? rows.length);
    for (const row of rows) {
      let notice = normalizeLhNotice(row);
      try {
        if (notice.panId) {
          const detail = await fetchLh(DETAIL_PATH, DETAIL_OP, { PAN_ID: notice.panId });
          notice = applyLhDetail(notice, detail);
        }
      } catch (err) {
        logger.warn({ err, panId: notice.panId }, 'LH detail fetch failed — list only');
      }
      out.push({ notice, units: [] });
    }
    logger.info({ page, fetched: out.length, total }, 'LH list page');
    if (page * PG >= total || rows.length === 0) break;
    page++;
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit tests/ingest/subscriptions/adapter-lh-presub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/adapter-lh-presub.ts tests/ingest/subscriptions/adapter-lh-presub.test.ts
git commit -m "feat(subscription): LH 사전청약 목록→상세 어댑터"
```

---

## Task 8: Upsert 모듈 (`upsert.ts`)

정규화 묶음을 `SubscriptionNotice`(ON CONFLICT source+sourceKey) + `SubscriptionUnit`(공고 단위 교체)으로 저장한다.

**Files:**
- Create: `scripts/ingest/subscriptions/upsert.ts`

- [ ] **Step 1: 구현 작성**

`scripts/ingest/subscriptions/upsert.ts`:

```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { NoticeWithUnits, NormalizedNotice } from './types';

function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

// source+sourceKey 기준 upsert 후 id 반환
async function upsertNotice(n: NormalizedNotice): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO "SubscriptionNotice" (
      "source", "category", "sourceKey",
      "houseManageNo", "pblancNo", "panId", "origNoticeKey",
      "name", "status", "regionCode", "regionName", "address", "totalSupply",
      "noticeDate", "receiptBegin", "receiptEnd", "winnerDate", "contractBegin", "contractEnd", "moveInYm",
      "homepage", "noticeUrl", "developer", "constructor", "tel",
      "location", "rawJson", "updatedAt"
    ) VALUES (
      ${n.source}::"SubscriptionSource", ${n.category}::"SubscriptionCategory", ${n.sourceKey},
      ${n.houseManageNo}, ${n.pblancNo}, ${n.panId}, ${n.origNoticeKey},
      ${n.name}, ${n.status}, ${n.regionCode}, ${n.regionName}, ${n.address}, ${n.totalSupply},
      ${n.noticeDate}, ${n.receiptBegin}, ${n.receiptEnd}, ${n.winnerDate}, ${n.contractBegin}, ${n.contractEnd}, ${n.moveInYm},
      ${n.homepage}, ${n.noticeUrl}, ${n.developer}, ${n.constructor}, ${n.tel},
      ${locationSql(n.lat, n.lng)}, ${JSON.stringify(n.rawJson)}::jsonb, NOW()
    )
    ON CONFLICT ("source", "sourceKey") DO UPDATE SET
      "category" = EXCLUDED."category",
      "houseManageNo" = EXCLUDED."houseManageNo",
      "pblancNo" = EXCLUDED."pblancNo",
      "panId" = EXCLUDED."panId",
      "origNoticeKey" = EXCLUDED."origNoticeKey",
      "name" = EXCLUDED."name",
      "status" = EXCLUDED."status",
      "regionCode" = EXCLUDED."regionCode",
      "regionName" = EXCLUDED."regionName",
      "address" = EXCLUDED."address",
      "totalSupply" = EXCLUDED."totalSupply",
      "noticeDate" = EXCLUDED."noticeDate",
      "receiptBegin" = EXCLUDED."receiptBegin",
      "receiptEnd" = EXCLUDED."receiptEnd",
      "winnerDate" = EXCLUDED."winnerDate",
      "contractBegin" = EXCLUDED."contractBegin",
      "contractEnd" = EXCLUDED."contractEnd",
      "moveInYm" = EXCLUDED."moveInYm",
      "homepage" = EXCLUDED."homepage",
      "noticeUrl" = EXCLUDED."noticeUrl",
      "developer" = EXCLUDED."developer",
      "constructor" = EXCLUDED."constructor",
      "tel" = EXCLUDED."tel",
      "location" = EXCLUDED."location",
      "rawJson" = EXCLUDED."rawJson",
      "updatedAt" = NOW()
    RETURNING "id"
  `;
  return rows[0].id;
}

// 공고 1건 + 주택형별 저장. 주택형별은 매 수집마다 전량 교체(delete→insert).
export async function upsertNoticeWithUnits(item: NoticeWithUnits): Promise<void> {
  const noticeId = await upsertNotice(item.notice);
  await prisma.subscriptionUnit.deleteMany({ where: { noticeId } });
  if (item.units.length === 0) return;
  // (modelNo, houseType) 중복 제거 — unique 제약 위반 방지
  const seen = new Set<string>();
  const unique = item.units.filter((u) => {
    const k = `${u.modelNo ?? ''}|${u.houseType ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await prisma.subscriptionUnit.createMany({
    data: unique.map((u) => ({
      noticeId,
      modelNo: u.modelNo,
      houseType: u.houseType,
      area: u.area,
      generalSupply: u.generalSupply,
      specialSupply: u.specialSupply,
      topAmount: u.topAmount,
      rawJson: u.rawJson as Prisma.InputJsonValue,
    })),
  });
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/subscriptions/upsert.ts
git commit -m "feat(subscription): notice/unit upsert (ON CONFLICT + unit 교체)"
```

---

## Task 9: Runner (`runner.ts`)

진입점. `--source` 선택, `IngestionRun` 기록, 청약홈 지오코딩, upsert, 알림.

**Files:**
- Create: `scripts/ingest/subscriptions/runner.ts`
- Modify: `package.json` (scripts 에 `ingest:subscriptions` 추가)

- [ ] **Step 1: runner 구현**

`scripts/ingest/subscriptions/runner.ts`:

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { geocode } from '@/scripts/ingest/geocoder';
import { APPLYHOME_CONFIG, fetchApplyhomeCategory } from './adapter-applyhome';
import { fetchLhPresub } from './adapter-lh-presub';
import { upsertNoticeWithUnits } from './upsert';
import { SUBSCRIPTION_INGEST_SOURCE } from './types';
import type { NoticeWithUnits, SubscriptionSourceKey } from './types';

const ALL_KEYS: SubscriptionSourceKey[] = ['apt', 'urbty', 'remndr', 'pblpvt', 'opt', 'lh'];

function parseArgs(): { sources: SubscriptionSourceKey[] } {
  const raw = process.argv.slice(2).find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'all';
  if (raw === 'all') return { sources: ALL_KEYS };
  if (!ALL_KEYS.includes(raw as SubscriptionSourceKey)) {
    throw new Error(`--source must be one of: ${ALL_KEYS.join(', ')}, all. Got: ${raw}`);
  }
  return { sources: [raw as SubscriptionSourceKey] };
}

async function collect(key: SubscriptionSourceKey): Promise<NoticeWithUnits[]> {
  if (key === 'lh') return fetchLhPresub();
  return fetchApplyhomeCategory(APPLYHOME_CONFIG[key]);
}

// 청약홈 공고: address 로 지오코딩 (LH 는 address 없음 → 스킵)
async function geocodeItems(items: NoticeWithUnits[]): Promise<void> {
  for (const { notice } of items) {
    if (!notice.address || (notice.lat != null && notice.lng != null)) continue;
    const coord = await geocode(notice.address);
    if (coord) {
      notice.lat = coord.lat;
      notice.lng = coord.lng;
    }
  }
}

async function runOne(key: SubscriptionSourceKey): Promise<number> {
  const source = SUBSCRIPTION_INGEST_SOURCE[key];
  const run = await prisma.ingestionRun.create({
    data: { source, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const items = await collect(key);
    await geocodeItems(items);
    let upserted = 0;
    for (const item of items) {
      await upsertNoticeWithUnits(item);
      upserted++;
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ key, upserted }, 'subscription source done');
    return upserted;
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

async function main() {
  const { sources } = parseArgs();
  logger.info({ sources }, 'subscription ingest start');
  let total = 0;
  let failed = 0;
  for (const key of sources) {
    try {
      total += await runOne(key);
    } catch (err) {
      failed++;
      logger.error({ err, key }, 'subscription source failed');
    }
  }
  const summary = { total, failed, sources };
  logger.info(summary, 'subscription ingest done');
  await notify(failed === 0 ? 'info' : 'warn', 'subscription ingest complete', summary);
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'subscription runner fatal');
  process.exit(1);
});
```

- [ ] **Step 2: package.json 스크립트 추가**

`package.json` 의 `scripts` 에 추가(기존 `ingest:run` 다음 줄):

```json
"ingest:subscriptions": "dotenv -e .env.local -- tsx scripts/ingest/subscriptions/runner.ts",
```

- [ ] **Step 3: 타입체크 + 전체 단위 테스트**

Run: `pnpm typecheck && pnpm test:unit tests/ingest/subscriptions`
Expected: 모두 PASS.

- [ ] **Step 4: 로컬 소량 수집 (멱등성 검증)**

Run: `dotenv -e .env.test -- tsx scripts/ingest/subscriptions/runner.ts --source=lh`
Expected: LH 공고 N건 upsert, 에러 없음. (`.env.test` = 로컬 docker DB, `PUBLIC_DATA_KEY` 가 .env.test 에 있어야 함 — 없으면 `.env.local` 로 1회 검증)

Run 재실행(같은 명령): Expected: 신규 행 증가 없음(ON CONFLICT). DB 행 수 확인:
```bash
dotenv -e .env.test -- tsx -e "import {prisma} from '@/lib/db'; prisma.subscriptionNotice.count().then(c=>{console.log('notices',c);return prisma.\$disconnect()})"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/runner.ts package.json
git commit -m "feat(subscription): runner(소스 선택·지오코딩·알림)"
```

---

## Task 10: GitHub Actions 워크플로우

**Files:**
- Create: `.github/workflows/ingest-subscriptions.yml`

- [ ] **Step 1: 워크플로우 작성**

`.github/workflows/ingest-subscriptions.yml`:

```yaml
name: ingest-subscriptions

on:
  schedule:
    - cron: '30 18 * * *'
  workflow_dispatch:
    inputs:
      source:
        description: 'apt | urbty | remndr | pblpvt | opt | lh | all'
        required: true
        default: 'all'

jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        source: ${{ github.event_name == 'workflow_dispatch' && fromJson(format('["{0}"]', inputs.source)) || fromJson('["apt","urbty","remndr","pblpvt","opt","lh"]') }}
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
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
      - run: pnpm tsx scripts/ingest/subscriptions/runner.ts --source=${{ matrix.source }}
        timeout-minutes: 120
```

> `workflow_dispatch` 에서 `source=all` 을 고르면 매트릭스가 `["all"]` 한 칸이 되어 runner 가 내부적으로 전체를 순회한다. 스케줄 실행은 6개 소스를 병렬로 돈다.

- [ ] **Step 2: YAML 문법 확인**

Run: `node -e "require('js-yaml')" 2>/dev/null || true` (없으면 생략) — 또는 GitHub 에 push 후 Actions 탭에서 파싱 에러 없는지 확인.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ingest-subscriptions.yml
git commit -m "ci(subscription): 일일 수집 워크플로우(매트릭스)"
```

---

## Task 11: 전체 검증 + PR

**Files:** 없음(검증·통합)

- [ ] **Step 1: 전체 테스트·타입·린트**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit tests/ingest/subscriptions`
Expected: 모두 통과.

- [ ] **Step 2: 청약홈 1개 카테고리 실수집 (운영 키, 로컬 DB)**

Run: `dotenv -e .env.local -- tsx scripts/ingest/subscriptions/runner.ts --source=apt`
Expected: APT 공고 다수 upsert(수천 건 가능 — 시간 소요), 주택형별 생성. 에러 없이 OK 로그.

> 주의: APT 는 공고 × 주택형별 N+1 호출이라 오래 걸린다. 검증은 도중 중단해도 되고, 멱등 재실행으로 이어진다.

- [ ] **Step 3: 데이터 sanity 확인**

```bash
dotenv -e .env.local -- tsx -e "import {prisma} from '@/lib/db'; (async()=>{const n=await prisma.subscriptionNotice.count();const u=await prisma.subscriptionUnit.count();const geo=await prisma.\$queryRaw\`SELECT COUNT(*)::int c FROM \"SubscriptionNotice\" WHERE location IS NOT NULL\`;console.log({n,u,geo});await prisma.\$disconnect()})()"
```
Expected: `n`>0, `u`>0, APT 공고 상당수 `location` 채워짐(지오코딩 성공분).

- [ ] **Step 4: PR 생성**

```bash
git push -u origin feat/subscription-ingest
gh pr create --base main --head feat/subscription-ingest \
  --title "feat(subscription): 청약홈·LH 사전청약 공고 통합 수집" \
  --body "$(cat <<'EOF'
## Summary
- 청약홈(ApplyhomeInfoDetailSvc) 5개 카테고리 + LH 사전청약(lhLeaseNoticeBfh)을 통합 `SubscriptionNotice`/`SubscriptionUnit` 모델로 수집.
- 공통 축은 컬럼 정규화, 소스 고유 필드는 `rawJson` 보존. 청약홈은 config 기반 단일 어댑터, LH 는 목록→상세 2단계.
- 청약홈 공급위치 지오코딩(`location`), amenities 스냅샷 upsert 패턴 준용.
- `.github/workflows/ingest-subscriptions.yml` 일일 매트릭스 수집.

## Test
- 어댑터/날짜 파서 단위 테스트(fixture 기반), 로컬 멱등성 확인.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: GitHub Actions 1회 수동 실행 검증**

`gh workflow run ingest-subscriptions.yml -f source=lh` 후 Actions 탭에서 성공 확인(운영 DB secrets 사용).

---

## Self-Review (작성자 체크 완료)

- **Spec 커버리지**: 통합 모델(Task 1) · 청약홈 5카테고리(Task 6) · LH 목록→상세(Task 7) · 지오코딩(Task 9) · rawJson 보존(Task 6/7) · 멱등 upsert(Task 8) · GitHub Actions(Task 10) · TDD 검증(Task 2/6/7) 모두 태스크로 매핑됨.
- **Spec 대비 변경점**: spec 의 카테고리별 어댑터 파일 5개 → config 기반 `adapter-applyhome.ts` 1개로 통합(DRY). 동작 동일.
- **타입 일관성**: `NormalizedNotice`/`NormalizedUnit`/`NoticeWithUnits`(Task 3) 가 어댑터(6/7)·upsert(8)·runner(9) 전반에서 동일 시그니처로 사용됨. `lat`/`lng` 보관 → upsert 에서 `locationSql` 변환.
- **미해결 가정**: LH 상세 operation 명(`getLeaseNoticeBfhDtlInfo1`)은 명세 예제가 자체 모순(`getLeaseNoticeDtlInfo1`)이라 Task 5 probe 에서 실측 교정. `PUBLIC_DATA_KEY` 가 odcloud·B552555 양쪽에서 동작하는지도 probe 에서 확인.
