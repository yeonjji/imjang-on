# 가이드 데이터 블록 G-2 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans로 태스크 단위 실행. 체크박스(`- [ ]`)로 진행 추적.

**Goal:** 실거래 기반 무거운 블록 5종을 ETL 사전계산 스냅샷으로 만들어 가이드 4편에 끼운다.

**Architecture:** `DashboardSnapshot`(기존 모델, 마이그레이션 없음)에 블록별 payload를 저장한다.
집계는 `scripts/guide/refresh-data-snapshot.ts`가 온박스 ETL에서 돌리고, 페이지는 스냅샷을 즉시 읽는다.
G-1의 `GUIDE_DATA_BLOCK_KEYS` → `GUIDE_DATA_BLOCK_COMPONENTS` 경로를 그대로 확장한다.

**Tech Stack:** Prisma `$queryRaw`(집계는 전부 raw SQL — `regr_slope`·`percentile_cont`·PostGIS는 Prisma API로 표현 불가), Next.js server component, PostGIS.

**스펙:** `docs/superpowers/specs/2026-08-10-guide-data-blocks-design.md` §3.3 · §4.2

## Global Constraints

- 블록키는 `lib/guide/data-blocks.ts`의 `GUIDE_DATA_BLOCK_KEYS`에 추가한다. 여기가 단일 진실 원천이다.
- 모든 블록은 하단에 **데이터 기준일 + 출처 캡션**을 단다. 출처 id는 `molit-rtms`(실거래), `subway`(지하철).
- 스냅샷이 없거나 표본이 부족하면 블록은 `null`을 반환한다 — 그 자리만 비고 본문은 그대로 읽힌다.
- 페이지 요청 경로에서 `Transaction`(7.6M행)을 집계하지 않는다. 반드시 스냅샷 읽기다.
- **교란 보정은 타협하지 않는다.** 역세권·층 프리미엄은 전국 단순 비교가 아니라 §"방법론"의 보정판으로 계산한다.
- 수치 라벨에 인과를 단정하지 않는다(`PRODUCT.md` 과장 금지). "역세권이라서 비싸다"가 아니라 "같은 시군구 안에서 이만큼 차이가 난다".
- `pnpm lint` → `typecheck` → `test:unit` → `build` 순으로 검증. UI 문구가 늘어나므로 e2e도 돌린다.

## 방법론 — 왜 단순 집계를 쓰지 않는가

운영 DB 실측(2026-08-10)에서 단순 집계와 보정 집계가 크게 갈렸다. 단순 집계는 구성 효과를
인과로 오독하게 만든다.

| 블록 | 단순 집계 | 보정 집계 | 단순 집계가 틀린 이유 |
|---|---|---|---|
| `subway-premium` | +97% (전국 역세권 3,289 vs 비역세권 1,669 만원/평) | **+12.9%** (같은 시군구 내 비교의 시군구별 중앙값, n≥30인 120개 시군구, IQR −1.0~+26.6%) | 지하철이 수도권에만 있어 "역세권 vs 지방" 비교가 된다 |
| `floor-premium` | 저층 2,006 → 고층 2,655 만원/평 | **한 층당 +0.63%** (같은 단지·같은 평형 OLS, n≥10 & R²≥0.2인 6,981개 조합의 중앙값, IQR +0.39~+0.98%) | 고층 건물이 더 새 건물·대단지라 층이 아니라 건물이 비싼 것 |

`price-trend-24m`은 **진행 중인 당월을 뺀다.** 실거래 신고 기한이 30일이라 당월은 항상 과소 집계된다
(실측: 2026-08 3,194건 vs 2026-07 37,975건 vs 2026-06 45,781건). 직전 달도 아직 차는 중이라
블록 하단에 "최근 달은 신고가 계속 반영돼 늘어날 수 있습니다"를 단다.

## 스펙과 다르게 하는 것 (근거 포함)

1. **`ltv-by-region`은 "규제 비율"이 아니라 "예시 비율 3구간"으로 만든다.** 스펙은 규제 비율을 곱하라고
   했지만 (a) LTV 비율의 데이터 소스가 우리 DB에 없고 (b) 대상 가이드 본문이 의도적으로 수치를 밝히지
   않는다("정부 정책에 따라 달라질 수 있습니다 … 반드시 최신 기준을 확인"). 특정 정책을 단정하는 대신
   40·50·70%를 **예시로 명시**해 "규제가 얼마를 뜻하는가"를 보여준다. (사용자 승인 2026-08-10)
2. **평균이 아니라 중위 매매가를 쓴다.** 시도별 평균가는 초고가 거래에 끌려 필요 자기자금을 과대
   표시한다. 라벨도 "중위 매매가"로 정확히 쓴다.
3. **ETL 훅은 `deploy/run-etl.sh` 한 곳만 고친다.** 스펙은 GitHub 워크플로에도 추가하라고 했지만
   `ingest-transactions-daily`는 `disabled_manually` 상태다(`gh workflow list --all` 실측). 죽은
   워크플로에 줄을 넣으면 나중에 읽는 사람을 오도한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/guide/data-snapshot.ts` (신규) | 스냅샷 키 상수, `writeGuideSnapshot()` / `readGuideSnapshot(key)` |
| `lib/guide/blocks/heavy/area-price.ts` (신규) | 평형대별 단가 집계 |
| `lib/guide/blocks/heavy/floor-premium.ts` (신규) | 단지·평형 내 층 회귀 |
| `lib/guide/blocks/heavy/price-trend.ts` (신규) | 24개월 거래량·중위 단가 |
| `lib/guide/blocks/heavy/subway-premium.ts` (신규) | 시군구 내 역세권 단가 차 |
| `lib/guide/blocks/heavy/ltv-by-region.ts` (신규) | 시도별 중위 매매가 |
| `lib/guide/data-blocks.ts` (수정) | 키 5종 추가 |
| `app/(public)/guide/[slug]/_components/data-block.tsx` (수정) | 컴포넌트 5종 추가 + 매핑 |
| `scripts/guide/refresh-data-snapshot.ts` (신규) | 집계 5종 실행 → 스냅샷 기록 |
| `deploy/run-etl.sh` (수정) | `transactions-daily`에 한 줄 |
| `lib/guide/insert-blocks.ts` (수정) | 대상 4편 placement 추가 |

집계는 `blocks/heavy/`로 묶는다 — 기존 `blocks/*.ts`(가벼운 블록, 렌더 시 조회)와 호출 시점이
정반대라 디렉터리로 구분해야 잘못된 곳에서 부르는 실수를 막는다.

---

## Task 1: 스냅샷 모듈

**Files:**
- Create: `lib/guide/data-snapshot.ts`
- Test: `tests/lib/guide-data-snapshot.test.ts`

**Interfaces:**
- Produces: `GUIDE_SNAPSHOT_KEYS`, `writeGuideSnapshot(key, payload)`, `readGuideSnapshot<T>(key)`

`DashboardSnapshot.key`가 `@db.VarChar(40)`이라 키는 40자 이내여야 한다. `guide_` 접두사를 붙여
홈 대시보드 키(`market_briefing`·`popular_sigungus`)와 충돌하지 않게 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, it, expect } from 'vitest';
import { GUIDE_SNAPSHOT_KEYS, guideSnapshotKey } from '@/lib/guide/data-snapshot';

describe('guide snapshot keys', () => {
  it('모든 키가 DashboardSnapshot.key 길이 제한(40) 안이다', () => {
    for (const k of GUIDE_SNAPSHOT_KEYS) {
      expect(k.length).toBeLessThanOrEqual(40);
      expect(k.startsWith('guide_')).toBe(true);
    }
  });
  it('블록키를 스냅샷키로 바꾼다', () => {
    expect(guideSnapshotKey('area-price')).toBe('guide_area_price');
    expect(guideSnapshotKey('subway-premium')).toBe('guide_subway_premium');
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/lib/guide-data-snapshot.test.ts` → 모듈 없음

- [ ] **Step 3: 구현**

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/** 무거운 블록만 스냅샷을 쓴다. 가벼운 블록 4종은 렌더 시 직접 조회한다. */
export const HEAVY_BLOCK_KEYS = [
  'area-price', 'floor-premium', 'price-trend-24m', 'subway-premium', 'ltv-by-region',
] as const;
export type HeavyBlockKey = (typeof HEAVY_BLOCK_KEYS)[number];

/** `area-price` → `guide_area_price`. DashboardSnapshot.key는 VarChar(40). */
export function guideSnapshotKey(block: HeavyBlockKey): string {
  return `guide_${block.replace(/-/g, '_')}`;
}

export const GUIDE_SNAPSHOT_KEYS = HEAVY_BLOCK_KEYS.map(guideSnapshotKey);

export async function writeGuideSnapshot(block: HeavyBlockKey, payload: unknown): Promise<void> {
  const key = guideSnapshotKey(block);
  const json = payload as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key },
    create: { key, payload: json },
    update: { payload: json },
  });
}

/** 없으면 null. 페이지는 null을 받으면 블록을 렌더하지 않는다. */
export async function readGuideSnapshot<T>(block: HeavyBlockKey): Promise<T | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: guideSnapshotKey(block) } });
  return (row?.payload as unknown as T) ?? null;
}
```

- [ ] **Step 4: 통과 확인** — `pnpm vitest run tests/lib/guide-data-snapshot.test.ts`

- [ ] **Step 5: 커밋** — `feat(guide): 무거운 블록 스냅샷 모듈`

---

## Task 2: 집계 5종

**Files:**
- Create: `lib/guide/blocks/heavy/{area-price,floor-premium,price-trend,subway-premium,ltv-by-region}.ts`
- Test: `tests/lib/guide-heavy-blocks.test.ts`

**Interfaces:**
- Consumes: 없음(직접 SQL)
- Produces: `computeAreaPrice()`, `computeFloorPremium()`, `computePriceTrend()`, `computeSubwayPremium()`, `computeLtvByRegion()` — 각각 `Promise<{...rows, asOf}>`

아래 SQL은 전부 2026-08-10 운영 DB에서 실행해 결과와 소요 시간을 확인했다. 그대로 쓴다.

각 함수는 `asOf`로 **집계에 쓰인 마지막 계약일**을 반환한다(`updatedAt`이 아니다 — 실거래는
계약일이 기준일이다).

- [ ] **Step 1: area-price 구현**

```ts
import { prisma } from '@/lib/db';

export interface AreaPriceRow { band: string; n: number; manwonPerPyeong: number }
export interface AreaPriceResult { rows: AreaPriceRow[]; asOf: string | null }

/** 최근 12개월 아파트 매매의 평형대별 평당 단가. 실측 8.9초. */
export async function computeAreaPrice(): Promise<AreaPriceResult> {
  const rows = await prisma.$queryRaw<Array<{ band: string; n: bigint; ppp: number }>>`
    SELECT CASE WHEN "exclusiveArea" < 60 THEN '전용 60㎡ 미만'
                WHEN "exclusiveArea" < 85 THEN '전용 60~85㎡'
                WHEN "exclusiveArea" < 102 THEN '전용 85~102㎡'
                WHEN "exclusiveArea" < 135 THEN '전용 102~135㎡'
                ELSE '전용 135㎡ 초과' END AS band,
           COUNT(*) AS n,
           ROUND(AVG("dealAmount"::numeric / "exclusiveArea") * 3.3057851239669422)::int AS ppp
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL AND "exclusiveArea" > 0
    GROUP BY 1
    ORDER BY MIN("exclusiveArea")
  `;
  const asOf = await lastContractDate();
  return { rows: rows.map((r) => ({ band: r.band, n: Number(r.n), manwonPerPyeong: r.ppp })), asOf };
}

/** 집계 대상의 최신 계약일(YYYY-MM-DD). 모든 무거운 블록이 공유한다. */
export async function lastContractDate(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ d: Date | null }>>`
    SELECT MAX("contractDate") AS d FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE' AND "cancelDate" IS NULL
  `;
  const d = rows[0]?.d;
  return d ? d.toISOString().slice(0, 10) : null;
}
```

기대값(운영 실측): 5행, `전용 60㎡ 미만` 2,226 / `60~85` 2,217 / `85~102` 2,547 / `102~135` 2,433 / `135 초과` 2,718 만원/평.

- [ ] **Step 2: floor-premium 구현**

```ts
export interface FloorPremiumResult {
  groups: number;      // n≥10인 (단지, 평형) 조합 수
  groupsUsed: number;  // 그중 R²≥0.2로 채택한 수
  medianPctPerFloor: number;
  p25: number;
  p75: number;
  asOf: string | null;
}

/**
 * 같은 단지·같은 평형 안에서 한 층 오를 때 ㎡당 단가가 몇 % 오르는지. 실측 38.7초.
 * 전국 저/중/고층 평균 비교는 고층 건물이 더 새 건물이라 생기는 차이를 층 효과로 오독하게 만든다.
 * OLS 기울기를 조합별로 구하고 R²≥0.2(층이 가격을 설명하는 조합)만 채택해 중앙값을 낸다.
 * 24개월 창을 쓴다 — 12개월이면 조합당 n≥10을 채우는 단지가 크게 준다.
 */
export async function computeFloorPremium(): Promise<FloorPremiumResult> {
  const rows = await prisma.$queryRaw<Array<{
    groups: bigint; groups_used: bigint; med: number | null; p25: number | null; p75: number | null;
  }>>`
    WITH sale AS (
      SELECT "propertyId",
             ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS pyeong,
             "floor"::float AS f,
             "dealAmount"::float / NULLIF("exclusiveArea"::float, 0) AS ppa
      FROM "Transaction"
      WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
        AND "contractDate" >= (CURRENT_DATE - INTERVAL '24 months')
        AND "dealAmount" IS NOT NULL AND "floor" IS NOT NULL AND "floor" > 0
        AND "exclusiveArea" > 0 AND "cancelDate" IS NULL
    ), fit AS (
      SELECT COUNT(*) AS n, regr_slope(ppa, f) AS slope, regr_r2(ppa, f) AS r2, AVG(ppa) AS mean_ppa
      FROM sale GROUP BY "propertyId", pyeong
      HAVING COUNT(*) >= 10 AND regr_slope(ppa, f) IS NOT NULL AND AVG(ppa) > 0
    )
    SELECT COUNT(*) AS groups,
           COUNT(*) FILTER (WHERE r2 >= 0.2) AS groups_used,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY slope / mean_ppa * 100)
             FILTER (WHERE r2 >= 0.2) AS p75
    FROM fit
  `;
  const r = rows[0];
  const asOf = await lastContractDate();
  if (!r || r.med == null) return { groups: 0, groupsUsed: 0, medianPctPerFloor: 0, p25: 0, p75: 0, asOf };
  return {
    groups: Number(r.groups), groupsUsed: Number(r.groups_used),
    medianPctPerFloor: Number(r.med.toFixed(2)),
    p25: Number((r.p25 ?? 0).toFixed(2)), p75: Number((r.p75 ?? 0).toFixed(2)), asOf,
  };
}
```

기대값(운영 실측): `groups` 26,298 / `groupsUsed` 6,981 / 중앙값 +0.63% / IQR +0.39~+0.98%.

- [ ] **Step 3: price-trend 구현**

```ts
export interface PriceTrendPoint { month: string; n: number; medianPerPyeong: number }
export interface PriceTrendResult { points: PriceTrendPoint[]; asOf: string | null }

/**
 * 24개월 월별 거래량과 중위 평당가. 실측 5.5초.
 * **진행 중인 당월은 뺀다** — 실거래 신고 기한이 30일이라 당월은 항상 과소 집계된다
 * (실측: 2026-08 3,194건 vs 2026-07 37,975건). 직전 달도 아직 차는 중이라 컴포넌트에 주석을 단다.
 */
export async function computePriceTrend(): Promise<PriceTrendResult> {
  const rows = await prisma.$queryRaw<Array<{ m: string; n: bigint; med: number }>>`
    SELECT to_char(date_trunc('month', "contractDate"), 'YYYY-MM') AS m,
           COUNT(*) AS n,
           ROUND(percentile_cont(0.5) WITHIN GROUP (
             ORDER BY "dealAmount"::numeric / "exclusiveArea" * 3.3057851239669422))::int AS med
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (date_trunc('month', CURRENT_DATE) - INTERVAL '24 months')
      AND "contractDate" < date_trunc('month', CURRENT_DATE)
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL AND "exclusiveArea" > 0
    GROUP BY 1 ORDER BY 1
  `;
  return {
    points: rows.map((r) => ({ month: r.m, n: Number(r.n), medianPerPyeong: r.med })),
    asOf: await lastContractDate(),
  };
}
```

- [ ] **Step 4: subway-premium 구현**

```ts
export interface SubwayPremiumResult {
  sigungus: number;        // 양쪽 다 n≥30인 시군구 수
  medianPremiumPct: number;
  p25: number;
  p75: number;
  noPremiumSigungus: number; // 프리미엄이 0 이하인 시군구 수
  walkRadiusMeters: number;
  asOf: string | null;
}

/**
 * 도보권(역 800m 이내) 아파트가 같은 시군구의 비도보권보다 평당 몇 % 비싼지. 실측 32.6초.
 * 800m는 `lib/subway/nearby.ts`의 도보권 반경과 같은 값을 쓴다.
 * 전국 단순 비교(+97%)는 지하철이 수도권에만 있어 생기는 구성 효과라 쓰지 않는다.
 */
export async function computeSubwayPremium(): Promise<SubwayPremiumResult> {
  const rows = await prisma.$queryRaw<Array<{
    sigungus: bigint; med: number | null; p25: number | null; p75: number | null; no_prem: bigint;
  }>>`
    WITH prop AS (
      SELECT p.id, p."sigunguCode",
             EXISTS (SELECT 1 FROM "SubwayStation" s
                     WHERE s.location IS NOT NULL AND ST_DWithin(p.location, s.location, 800)) AS walkable
      FROM "Property" p
      WHERE p."propertyType" = 'APARTMENT' AND p."redirectToId" IS NULL AND p.location IS NOT NULL
    ), tx AS (
      SELECT pr.walkable, pr."sigunguCode" AS sgg,
             t."dealAmount"::numeric / t."exclusiveArea" * 3.3057851239669422 AS ppp
      FROM "Transaction" t JOIN prop pr ON pr.id = t."propertyId"
      WHERE t."dealType" = 'SALE' AND t."propertyType" = 'APARTMENT'
        AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
        AND t."dealAmount" IS NOT NULL AND t."cancelDate" IS NULL AND t."exclusiveArea" > 0
    ), bysgg AS (
      SELECT AVG(ppp) FILTER (WHERE walkable) AS w,
             COUNT(*) FILTER (WHERE walkable) AS nw,
             AVG(ppp) FILTER (WHERE NOT walkable) AS nwk,
             COUNT(*) FILTER (WHERE NOT walkable) AS nn
      FROM tx GROUP BY sgg
    ), ok AS (
      SELECT (w / nwk - 1) * 100 AS pct FROM bysgg WHERE nw >= 30 AND nn >= 30 AND nwk > 0
    )
    SELECT COUNT(*) AS sigungus,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY pct) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY pct) AS p75,
           COUNT(*) FILTER (WHERE pct <= 0) AS no_prem
    FROM ok
  `;
  const r = rows[0];
  const asOf = await lastContractDate();
  if (!r || r.med == null) {
    return { sigungus: 0, medianPremiumPct: 0, p25: 0, p75: 0, noPremiumSigungus: 0, walkRadiusMeters: 800, asOf };
  }
  return {
    sigungus: Number(r.sigungus),
    medianPremiumPct: Number(r.med.toFixed(1)),
    p25: Number((r.p25 ?? 0).toFixed(1)), p75: Number((r.p75 ?? 0).toFixed(1)),
    noPremiumSigungus: Number(r.no_prem), walkRadiusMeters: 800, asOf,
  };
}
```

기대값(운영 실측): 120개 시군구, 중앙값 +12.9%, IQR −1.0~+26.6%.

- [ ] **Step 5: ltv-by-region 구현**

```ts
export interface LtvRegionRow { sido: string; n: number; medianManwon: number }
export interface LtvByRegionResult { rows: LtvRegionRow[]; exampleLtvPct: number[]; asOf: string | null }

/**
 * 시도별 아파트 **중위** 매매가. 평균은 초고가 거래에 끌려 필요 자기자금을 과대 표시한다.
 * LTV 비율은 우리 DB에 없고 대상 가이드도 수치를 밝히지 않으므로 컴포넌트에서 **예시 비율**로
 * 명시해 곱한다(40·50·70%). 특정 시점의 규제를 단정하지 않는다.
 */
export async function computeLtvByRegion(): Promise<LtvByRegionResult> {
  const rows = await prisma.$queryRaw<Array<{ sido: string; n: bigint; med: number }>>`
    SELECT r.sido AS sido, COUNT(*) AS n,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY t."dealAmount"))::int AS med
    FROM "Transaction" t
    JOIN "Property" p ON p.id = t."propertyId"
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE t."propertyType" = 'APARTMENT' AND t."dealType" = 'SALE'
      AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND t."dealAmount" IS NOT NULL AND t."cancelDate" IS NULL
      AND p."redirectToId" IS NULL
    GROUP BY r.sido
    HAVING COUNT(*) >= 100
    ORDER BY med DESC
  `;
  return {
    rows: rows.map((r) => ({ sido: r.sido, n: Number(r.n), medianManwon: r.med })),
    exampleLtvPct: [40, 50, 70],
    asOf: await lastContractDate(),
  };
}
```

- [ ] **Step 6: 테스트** — 이 5개는 전부 운영 규모 데이터에 기대는 집계라 유닛 테스트로 값을 검증할 수
      없다. 테스트는 **계약**만 본다. 빈 DB에서 던지지 않고 빈 결과를 돌려주는지 확인한다.

```ts
import { describe, it, expect } from 'vitest';
import { computeAreaPrice } from '@/lib/guide/blocks/heavy/area-price';
import { computeFloorPremium } from '@/lib/guide/blocks/heavy/floor-premium';
import { computePriceTrend } from '@/lib/guide/blocks/heavy/price-trend';
import { computeSubwayPremium } from '@/lib/guide/blocks/heavy/subway-premium';
import { computeLtvByRegion } from '@/lib/guide/blocks/heavy/ltv-by-region';

describe('무거운 블록 집계 계약', () => {
  it('데이터가 없어도 던지지 않고 빈 결과를 돌려준다', async () => {
    await expect(computeAreaPrice()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(computePriceTrend()).resolves.toMatchObject({ points: expect.any(Array) });
    await expect(computeLtvByRegion()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(computeFloorPremium()).resolves.toMatchObject({ groupsUsed: expect.any(Number) });
    await expect(computeSubwayPremium()).resolves.toMatchObject({ sigungus: expect.any(Number) });
  });
  it('예시 LTV 비율은 40·50·70이다', async () => {
    const r = await computeLtvByRegion();
    expect(r.exampleLtvPct).toEqual([40, 50, 70]);
  });
});
```

- [ ] **Step 7: 통과 확인 후 커밋** — `feat(guide): 실거래 기반 무거운 블록 집계 5종`

---

## Task 3: 스냅샷 갱신 스크립트 + ETL 훅

**Files:**
- Create: `scripts/guide/refresh-data-snapshot.ts`
- Modify: `deploy/run-etl.sh:11`

**Interfaces:**
- Consumes: Task 1의 `writeGuideSnapshot`, Task 2의 `compute*`

`scripts/dashboard/refresh-snapshot.ts`와 같은 형태를 쓴다 — `DIRECT_URL` + `connection_limit=1` +
`statement_timeout=0`. 집계 5종 합계가 실측 ~90초라 기본 타임아웃에 걸린다.

- [ ] **Step 1: 스크립트 작성**

```ts
/**
 * 가이드 무거운 블록 스냅샷 갱신. 일일 실거래 ingest 이후 실행한다.
 *   dotenv -e .env.local -- tsx scripts/guide/refresh-data-snapshot.ts
 *
 * 한 블록이 실패해도 나머지는 갱신한다 — 전부 실패하면 페이지에서 블록만 사라지고 본문은 남는다.
 */
async function main() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }
  const { prisma } = await import('@/lib/db');
  const { writeGuideSnapshot } = await import('@/lib/guide/data-snapshot');
  const { computeAreaPrice } = await import('@/lib/guide/blocks/heavy/area-price');
  const { computeFloorPremium } = await import('@/lib/guide/blocks/heavy/floor-premium');
  const { computePriceTrend } = await import('@/lib/guide/blocks/heavy/price-trend');
  const { computeSubwayPremium } = await import('@/lib/guide/blocks/heavy/subway-premium');
  const { computeLtvByRegion } = await import('@/lib/guide/blocks/heavy/ltv-by-region');

  await prisma.$executeRawUnsafe(`SET statement_timeout = 0`);

  const jobs = [
    ['area-price', computeAreaPrice],
    ['floor-premium', computeFloorPremium],
    ['price-trend-24m', computePriceTrend],
    ['subway-premium', computeSubwayPremium],
    ['ltv-by-region', computeLtvByRegion],
  ] as const;

  let failed = 0;
  for (const [key, compute] of jobs) {
    const t = Date.now();
    try {
      await writeGuideSnapshot(key, await compute());
      console.log(`[guide-snapshot] ${key} ok in ${Date.now() - t}ms`);
    } catch (err) {
      failed++;
      console.error(`[guide-snapshot] ${key} FAILED`, err);
    }
  }
  await prisma.$disconnect();
  if (failed === jobs.length) process.exit(1); // 전부 실패면 ETL 로그에 드러나야 한다
}

main().catch((err) => { console.error('[guide-snapshot] fatal', err); process.exit(1); });
```

- [ ] **Step 2: ETL 훅 추가** — `deploy/run-etl.sh`의 `transactions-daily` 케이스, 홈 스냅샷 갱신 **다음 줄**

```bash
  transactions-daily)
    $DC pnpm ingest:run
    $DC pnpm tsx scripts/dashboard/refresh-snapshot.ts
    $DC pnpm tsx scripts/guide/refresh-data-snapshot.ts
    ;;
```

> `deploy/**` 수정은 한 배포 늦게 적용된다(박스의 `/opt/imjang`이 배포 시점에 갱신되므로).
> 첫 스냅샷은 배포 후 박스에서 수동 실행한다 — Task 5의 사전 조건.

- [ ] **Step 3: 커밋** — `feat(guide): 무거운 블록 스냅샷 갱신 스크립트 + ETL 훅`

---

## Task 4: 블록 컴포넌트 5종

**Files:**
- Modify: `lib/guide/data-blocks.ts`, `app/(public)/guide/[slug]/_components/data-block.tsx`
- Test: `tests/lib/guide-data-blocks.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 `readGuideSnapshot`, `GUIDE_DATA_BLOCK_COMPONENTS`의 기존 형태

- [ ] **Step 1: 블록키 5종 추가**

```ts
export const GUIDE_DATA_BLOCK_KEYS = [
  'hospital-by-type', 'childcare-by-type', 'childcare-waitlist', 'charger-mix',
  'area-price', 'floor-premium', 'price-trend-24m', 'subway-premium', 'ltv-by-region',
] as const;
```

`GUIDE_DATA_BLOCK_COMPONENTS`가 `Record<GuideDataBlockKey, ...>`라 컴포넌트를 안 만들면 컴파일 에러가 난다.

- [ ] **Step 2: 컴포넌트 구현** — 기존 `BlockShell`을 그대로 쓴다. `floor-premium`·`subway-premium`은
      표가 아니라 한 줄 수치라 `BlockShell`에 `rows` 1행으로 넣는다.

```tsx
async function AreaPrice() {
  const d = await readGuideSnapshot<AreaPriceResult>('area-price');
  if (!d || d.rows.length === 0) return null;
  return (
    <BlockShell
      title="평형대별 평당 거래가"
      note="최근 12개월 아파트 매매 실거래를 전용면적 구간별로 집계한 값입니다."
      sources={['molit-rtms']}
      headers={['전용면적', '거래 건수', '평당 거래가']}
      rows={d.rows.map((r) => [r.band, r.n, `${r.manwonPerPyeong.toLocaleString('ko-KR')}만원`])}
      asOfText={d.asOf}
    />
  );
}

async function SubwayPremium() {
  const d = await readGuideSnapshot<SubwayPremiumResult>('subway-premium');
  if (!d || d.sigungus === 0) return null;
  return (
    <BlockShell
      title="역 도보권 아파트는 얼마나 비싼가"
      note={`역에서 ${d.walkRadiusMeters}m 이내 아파트와 같은 시군구의 그 밖 아파트를 평당 거래가로 비교했습니다. 지역을 섞으면 수도권과 지방을 비교하게 되므로 시군구 안에서만 비교합니다.`}
      sources={['molit-rtms', 'subway']}
      headers={['구분', '값']}
      rows={[
        ['시군구별 차이의 중앙값', `+${d.medianPremiumPct}%`],
        ['중간 절반의 범위', `${d.p25}% ~ +${d.p75}%`],
        ['비교한 시군구 수', `${d.sigungus}곳`],
        ['차이가 없거나 더 싼 시군구', `${d.noPremiumSigungus}곳`],
      ]}
      asOfText={d.asOf}
    />
  );
}
```

`floor-premium`은 `medianPctPerFloor`·`p25`~`p75`·`groupsUsed`/`groups`를 같은 형태로 낸다.
note에 **"같은 단지·같은 평형 안에서 비교한 값"**과 **"층이 가격을 설명하는 조합만 채택(R²≥0.2)"**를 명시한다.
`price-trend-24m`은 최근 12개월만 표로 내고(24행은 길다) note에 "최근 달은 신고가 계속 반영돼 늘어날 수 있습니다"를 단다.
`ltv-by-region`은 `headers=['지역','중위 매매가','LTV 40%','LTV 50%','LTV 70%']`, 값은 `중위가 × (1 − ltv/100)`,
note에 **"LTV는 예시 비율입니다. 규제지역·주택 수·대출 목적에 따라 실제 적용 기준이 다릅니다."**

- [ ] **Step 3: `BlockShell`에 `asOfText` 추가** — 기존은 `asOf: Date | null`인데 무거운 블록은
      계약일 문자열(`YYYY-MM-DD`)이다. `asOf?: Date | null`과 `asOfText?: string | null`을 둘 다 받고
      둘 중 있는 쪽을 쓴다. 기존 4종 호출부는 건드리지 않는다.

- [ ] **Step 4: 테스트** — 9개 키 전부에 컴포넌트가 매핑돼 있는지

```ts
it('모든 블록키에 컴포넌트가 있다', () => {
  for (const k of GUIDE_DATA_BLOCK_KEYS) {
    expect(GUIDE_DATA_BLOCK_COMPONENTS[k]).toBeTypeOf('function');
  }
});
```

- [ ] **Step 5: `pnpm lint` → `typecheck` → `test:unit` → `build` 후 커밋** — `feat(guide): 무거운 블록 컴포넌트 5종`

---

## Task 5: 본문 표식 삽입

**Files:**
- Modify: `lib/guide/insert-blocks.ts`
- Test: `tests/lib/guide-insert-blocks.test.ts` (기존)

**사전 조건:** Task 1~4가 배포되고, 박스에서 `scripts/guide/refresh-data-snapshot.ts`를 한 번
수동 실행해 스냅샷 5종이 채워져 있어야 한다. **스냅샷이 비면 표식만 들어가고 표는 안 나온다.**

- [ ] **Step 1: placement 4건 추가** — 앵커 소제목은 운영 본문에서 확인한 값이다(2026-08-10)

```ts
  { dedupeKey: 'realestate-read-transaction-price', blockKey: 'price-trend-24m',
    anchorHeading: '## 실거래가를 제대로 읽는 방법' },
  { dedupeKey: 'realestate-area-pyeong-explained', blockKey: 'area-price',
    anchorHeading: '## ㎡와 평, 어떻게 계산할까?' },
  { dedupeKey: 'life-subway-access', blockKey: 'subway-premium',
    anchorHeading: '## 역세권 판단 기준: 도보 거리, 환승, 노선 다양성' },
  { dedupeKey: 'finance-ltv-dsr-mortgage-regulation', blockKey: 'ltv-by-region',
    anchorHeading: '## 주택담보대출 한도는 어떻게 정해지나요?' },
```

> `floor-premium`은 이번에 본문에 넣지 않는다. 스펙이 지정한 대상
> `realestate-read-transaction-price` 한 편에 `price-trend-24m`과 둘 다 넣으면 한 편에 표가 두 개다.
> 그 편은 본문이 2,094자라 표 두 개를 받치지 못한다. `floor-premium`은 구현만 해 두고
> 층 관련 가이드가 생기거나 그 편의 본문이 늘어난 뒤에 넣는다.

`insert-blocks.ts`는 `dedupeKey` 중복을 테스트로 막고 있으므로(Task G-3에서 추가한 검증) 한 편에
두 블록을 넣으려면 자료구조부터 바꿔야 한다 — 지금은 필요 없다.

- [ ] **Step 2: 테스트 통과 확인 후 커밋 · PR**

- [ ] **Step 3: 배포 후 운영 반영** — dry-run diff 검토 → `--apply` → 비ASCII 슬러그는 **퍼센트
      인코딩된 경로**로 `/api/revalidate` 호출 → 박스 localhost에서 표 렌더·기준일·표식 누출 0 확인

---

## Self-Review

**스펙 커버리지:** §4.2의 5종 전부 구현(Task 2·4). `area-price`가 두 가이드를 공유한다는 스펙 문구는
따르지 않았다 — `realestate-read-transaction-price`에는 `price-trend-24m`이 더 맞고, 한 편에 표
두 개는 본문 분량이 받치지 못한다. §3.3의 스냅샷 재사용·마이그레이션 없음은 그대로 따랐다.

**플레이스홀더:** 없음. SQL은 전부 운영 DB에서 실행해 결과·소요 시간을 확인한 것이다.

**타입 일관성:** `HeavyBlockKey`(Task 1)는 `GuideDataBlockKey`(Task 4)의 부분집합이다. Task 4에서
키 5종을 추가하지 않으면 `writeGuideSnapshot` 호출이 컴파일된 채로 렌더 경로만 비므로,
Task 4의 `Record<GuideDataBlockKey, ...>` 전수 매핑이 그 격차를 잡는다.

**미확인:** 박스 2코어에서 집계 5종이 ETL 시간대에 겹쳐 돌 때의 부하. 실측 합계 ~90초는 단독 실행
기준이고, 일일 ingest 직후라 캐시가 더울 수도 차가울 수도 있다. 첫 수동 실행에서 시간을 재고
문제가 있으면 `subway-premium`(32초)만 주 1회로 뗀다.
