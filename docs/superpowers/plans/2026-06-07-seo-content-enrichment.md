# SEO 콘텐츠·메타 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데이터 기반 자동 서술(부동산 상세·지역 허브)로 thin content 리스크를 줄이고, 누락된 메타·구조화 데이터를 보정한다.

**Architecture:** 순수 함수(`lib/seo/josa.ts`, `lib/seo/blurb.ts`)가 이미 fetch된 데이터를 받아 한국어 문단을 생성하고, 서버 컴포넌트가 페이지에 인라인 렌더한다. 지역 통계는 신규 집계(`getRegionStats`, raw SQL)로 확보한다. 순수 함수라 단위 테스트로 검증한다.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma(raw SQL), Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-06-07-seo-content-enrichment-design.md`
**베이스:** PR #67(`feat/seo-improvements`) 위. `lib/seo/json-ld.tsx`(`placeSchema`/`breadcrumbSchema`/`JsonLd`) 재사용.

---

## File Structure

신규:
- `lib/seo/josa.ts` — 한글 조사 선택(받침 판정 + 조사 부착). 순수.
- `lib/seo/blurb.ts` — `salePriceTrend`, `propertyBlurb`, `regionBlurb`. 순수.
- `tests/lib/josa.test.ts`, `tests/lib/blurb.test.ts` — 단위 테스트.

수정:
- `lib/property.ts` — `getRegionStats(sigunguCode)` 추가(raw SQL 집계).
- `app/(public)/apt/[id]/page.tsx`, `officetel/[id]/page.tsx`, `villa/[id]/page.tsx` — `propertyBlurb` 렌더 + villa 메타 통일.
- `app/(public)/region/[code]/page.tsx` — `getRegionStats` + `regionBlurb` 렌더.
- 법적 페이지 6종 — description 추가.
- `app/(public)/subscription/[id]/page.tsx` — JSON-LD 추가.
- `app/(public)/medical/hospital/...`, `pharmacy/...`, `school/...`, `childcare/...` 상세 — `placeSchema` 필드 보강.

---

## Task 1: 한글 조사 util (TDD)

**Files:**
- Create: `lib/seo/josa.ts`
- Test: `tests/lib/josa.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/lib/josa.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasFinalConsonant, josa } from '@/lib/seo/josa';

describe('hasFinalConsonant', () => {
  it('detects 받침', () => {
    expect(hasFinalConsonant('서울')).toBe(true);   // ㄹ
    expect(hasFinalConsonant('부평')).toBe(true);    // ㅇ
  });
  it('detects no 받침', () => {
    expect(hasFinalConsonant('메가')).toBe(false);   // 가
    expect(hasFinalConsonant('도리')).toBe(false);   // 리
  });
  it('non-hangul ending → false (default)', () => {
    expect(hasFinalConsonant('APT')).toBe(false);
    expect(hasFinalConsonant('타워123')).toBe(false);
  });
  it('empty → false', () => {
    expect(hasFinalConsonant('')).toBe(false);
  });
});

describe('josa', () => {
  it('은/는', () => {
    expect(josa('서울', '은', '는')).toBe('서울은');
    expect(josa('메가', '은', '는')).toBe('메가는');
  });
  it('이/가', () => {
    expect(josa('부평', '이', '가')).toBe('부평이');
    expect(josa('도리', '이', '가')).toBe('도리가');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:unit josa`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`lib/seo/josa.ts`:

```ts
/** 단어의 마지막 글자에 받침(종성)이 있으면 true. 한글이 아니면 false. */
export function hasFinalConsonant(word: string): boolean {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  // 한글 음절 영역: 0xAC00 ~ 0xD7A3. (code - 0xAC00) % 28 !== 0 이면 종성 있음.
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 받침 유무에 따라 조사를 붙여 반환. josa('서울','은','는') → '서울은'. */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  return word + (hasFinalConsonant(word) ? withBatchim : withoutBatchim);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:unit josa`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/josa.ts tests/lib/josa.test.ts
git commit -m "feat(seo): 한글 조사 선택 util"
```

---

## Task 2: 부동산 서술 + 추세 (TDD)

**Files:**
- Create: `lib/seo/blurb.ts`
- Test: `tests/lib/blurb.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/lib/blurb.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { salePriceTrend, propertyBlurb, type PropertyBlurbInput } from '@/lib/seo/blurb';

describe('salePriceTrend', () => {
  it('up when recent avg > earlier avg by >3%', () => {
    const pts = [
      { month: '2025-01', avg: 50000 }, { month: '2025-02', avg: 50000 }, { month: '2025-03', avg: 50000 },
      { month: '2025-10', avg: 55000 }, { month: '2025-11', avg: 56000 }, { month: '2025-12', avg: 57000 },
    ];
    expect(salePriceTrend(pts)).toBe('up');
  });
  it('flat within ±3%', () => {
    const pts = [
      { month: '2025-01', avg: 50000 }, { month: '2025-02', avg: 50000 }, { month: '2025-03', avg: 50000 },
      { month: '2025-10', avg: 50500 }, { month: '2025-11', avg: 50000 }, { month: '2025-12', avg: 50200 },
    ];
    expect(salePriceTrend(pts)).toBe('flat');
  });
  it('null when too few points', () => {
    expect(salePriceTrend([{ month: '2025-12', avg: 50000 }])).toBeNull();
  });
});

const base: PropertyBlurbInput = {
  name: '래미안',
  regionFullName: '서울특별시 송파구',
  builtYear: 2020,
  households: 1200,
  txCount12m: 50,
  saleCount12m: 30,
  jeonseCount12m: 20,
  saleAvgPrice12m: 68000,
  jeonseAvgDeposit12m: 42000,
  trend: 'up',
  subwayCount: 1,
  infra: [{ label: '학교', count: 6 }, { label: '병원', count: 12 }],
};

describe('propertyBlurb', () => {
  it('활발 거래 + 상승 + 인프라 + 조사', () => {
    const s = propertyBlurb(base);
    expect(s).toContain('래미안은'); // 받침 → 은
    expect(s).toContain('서울특별시 송파구');
    expect(s).toContain('2020년 준공');
    expect(s).toContain('활발하게 거래');
    expect(s).toContain('상승');
    expect(s).toContain('지하철 1개역');
    expect(s).toContain('학교 6곳');
  });
  it('거래 적은 단지: 드물었으며 + 전세 문장 생략', () => {
    const s = propertyBlurb({ ...base, txCount12m: 2, saleCount12m: 2, jeonseCount12m: 0, jeonseAvgDeposit12m: null });
    expect(s).toContain('거래가 드물었으며');
    expect(s).not.toContain('전세 평균');
  });
  it('전세가율 70%+ 강조 문장', () => {
    const s = propertyBlurb({ ...base, saleAvgPrice12m: 50000, jeonseAvgDeposit12m: 40000 });
    expect(s).toContain('전세 수요가 강한');
  });
  it('인프라 없으면 인프라 문장 생략', () => {
    const s = propertyBlurb({ ...base, subwayCount: 0, infra: [] });
    expect(s).not.toContain('도보권');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:unit blurb`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`lib/seo/blurb.ts`:

```ts
import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';

export type Trend = 'up' | 'flat' | 'down';

/** 월별 매매 평균 포인트(오름차순)로 최근/이전 구간 평균을 비교해 추세 판정. */
export function salePriceTrend(points: { month: string; avg: number }[]): Trend | null {
  if (points.length < 4) return null;
  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const half = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, half);
  const recent = sorted.slice(half);
  const mean = (arr: { avg: number }[]) => arr.reduce((s, p) => s + p.avg, 0) / arr.length;
  const e = mean(earlier);
  const r = mean(recent);
  if (e === 0) return null;
  const diff = (r - e) / e;
  if (diff > 0.03) return 'up';
  if (diff < -0.03) return 'down';
  return 'flat';
}

export interface PropertyBlurbInput {
  name: string;
  regionFullName: string;
  builtYear: number | null;
  households: number | null;
  txCount12m: number;
  saleCount12m: number;
  jeonseCount12m: number;
  saleAvgPrice12m: number | null;   // 만원
  jeonseAvgDeposit12m: number | null; // 만원
  trend: Trend | null;
  subwayCount: number;
  infra: { label: string; count: number }[]; // count>0 인 주요 카테고리만
}

const TREND_TEXT: Record<Trend, string> = {
  up: ' 최근 실거래는 평균 대비 상승 흐름입니다.',
  down: ' 최근 실거래는 평균 대비 하락 흐름입니다.',
  flat: ' 최근 실거래는 평균과 비슷한 보합세입니다.',
};

export function propertyBlurb(i: PropertyBlurbInput): string {
  const subject = josa(i.name, '은', '는');
  const built = i.builtYear ? `${i.builtYear}년 준공` : '준공연도 미상';
  const households = i.households ? ` (${i.households.toLocaleString('ko-KR')}세대)` : '';

  let vol: string;
  if (i.txCount12m === 0) vol = '최근 1년간 거래가 없었고';
  else if (i.txCount12m <= 5) vol = `최근 1년간 매매 ${i.txCount12m}건으로 거래가 드물었으며`;
  else if (i.txCount12m >= 40) vol = `최근 1년간 매매 ${i.saleCount12m}건·전세 ${i.jeonseCount12m}건으로 활발하게 거래됐으며`;
  else vol = `최근 1년간 매매 ${i.saleCount12m}건·전세 ${i.jeonseCount12m}건이 거래됐으며`;

  const ratio =
    i.saleAvgPrice12m && i.jeonseAvgDeposit12m
      ? Math.round((i.jeonseAvgDeposit12m / i.saleAvgPrice12m) * 100)
      : null;

  let price: string;
  if (i.saleAvgPrice12m) {
    const jeonsePart = i.jeonseAvgDeposit12m ? `, 전세 평균은 ${formatBillion(i.jeonseAvgDeposit12m)}` : '';
    const ratioPart = ratio ? `으로 전세가율은 약 ${ratio}%입니다` : '입니다';
    price = ` 평균 매매가는 ${formatBillion(i.saleAvgPrice12m)}${jeonsePart}${ratioPart}.`;
  } else {
    price = ' 최근 매매 평균가 데이터는 충분하지 않습니다.';
  }

  const trend = i.trend ? TREND_TEXT[i.trend] : '';
  const jeonseStrong = ratio && ratio >= 70 ? ' 전세가율이 높아 전세 수요가 강한 편입니다.' : '';

  const parts: string[] = [];
  if (i.subwayCount > 0) parts.push(`지하철 ${i.subwayCount}개역`);
  for (const c of i.infra) parts.push(`${c.label} ${c.count}곳`);
  const infra = parts.length ? ` 도보권에 ${parts.join(', ')}이 있습니다.` : '';

  return `${subject} ${i.regionFullName}에 위치한 ${built} 단지입니다${households}. ${vol}${price}${trend}${jeonseStrong}${infra}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:unit blurb`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/blurb.ts tests/lib/blurb.test.ts
git commit -m "feat(seo): 부동산 서술 생성 + 추세 판정 (순수 함수)"
```

---

## Task 3: 상세 페이지에 서술 렌더

각 페이지는 이미 필요한 데이터를 fetch한다. `InfraCategory[]` → `{label, count}[]`(count>0, 상한 5개), 차트 SALE 포인트 → `salePriceTrend`, subway → `stations.length`를 만들어 `propertyBlurb`에 넘기고, 히어로 아래에 렌더한다.

**대상:** `app/(public)/apt/[id]/page.tsx`, `officetel/[id]/page.tsx`, `villa/[id]/page.tsx`

- [ ] **Step 1: import 추가 (각 파일)**

```tsx
import { propertyBlurb, salePriceTrend } from '@/lib/seo/blurb';
```

- [ ] **Step 2: 아파트 — 서술 계산 + 렌더 (`apt/[id]/page.tsx`)**

`return (` 직전에 계산 추가(이미 `property`, `coord`, `infra`, `subway`, `chart`가 존재):

```tsx
  const blurbText = propertyBlurb({
    name: property.name,
    regionFullName: property.region.fullName,
    builtYear: property.builtYear,
    households: property.households,
    txCount12m: property.txCount12m,
    saleCount12m: property.saleCount12m,
    jeonseCount12m: property.jeonseCount12m,
    saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
    trend: salePriceTrend(chart.SALE.map((p) => ({ month: p.month, avg: p.avg }))),
    subwayCount: subway.stations.length,
    infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
  });
```

히어로 바로 아래(`<PropertyDetailHero .../>` 다음)에 렌더:

```tsx
      <PropertyDetailHero property={property} region={property.region} />
      <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-5 py-4 leading-relaxed text-[var(--color-text)]">
        {blurbText}
      </p>
```

- [ ] **Step 3: 오피스텔 — 동일 적용 (`officetel/[id]/page.tsx`)**

오피스텔 페이지의 엔티티 변수명(예: `p` 또는 `property`)과 보유 데이터를 확인해 Step 2와 동일 형태로 계산·렌더. 차트/인프라/지하철을 페이지가 fetch하지 않으면 `trend: null`, `subwayCount: 0`, `infra: []`로 전달(서술이 해당 문장을 생략함).

- [ ] **Step 4: 빌라 — graceful degradation (`villa/[id]/page.tsx`)**

빌라 페이지는 데이터가 적을 수 있다. 페이지가 보유한 값만 넘기고 없는 항목은 `null`/`0`/`[]`로 전달:

```tsx
  const blurbText = propertyBlurb({
    name: property.name,
    regionFullName: property.region.fullName,
    builtYear: property.builtYear,
    households: property.households,
    txCount12m: property.txCount12m,
    saleCount12m: property.saleCount12m,
    jeonseCount12m: property.jeonseCount12m,
    saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
    trend: null,
    subwayCount: 0,
    infra: [],
  });
```

빌라 히어로 컴포넌트 바로 아래에 Step 2와 동일한 `<p>`로 렌더.

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 6: 라이브 확인**

`pnpm dev` → 아파트·빌라 상세 소스(JS 없이)에 서술 문단이 들어있는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add "app/(public)/apt" "app/(public)/officetel" "app/(public)/villa"
git commit -m "feat(seo): 부동산 상세에 단지 요약 서술 렌더"
```

---

## Task 4: 지역 통계 집계

**Files:**
- Modify: `lib/property.ts` (함수 추가)

- [ ] **Step 1: `getRegionStats` 구현 (raw SQL)**

`lib/property.ts` 끝에 추가:

```ts
export interface RegionStats {
  complexCount: number;
  txCount12m: number;
  saleAvgPrice12m: number | null;   // 만원
  jeonseAvgDeposit12m: number | null; // 만원
  priceMin: number | null;
  priceMax: number | null;
}

/** 시군구 단위 아파트 집계(거래 있는 단지 대상). raw SQL로 BigInt 평균 안전 처리. */
export async function getRegionStats(sigunguCode: string): Promise<RegionStats> {
  const rows = await prisma.$queryRaw<Array<{
    complex_count: number;
    tx_count: number;
    sale_avg: number | null;
    jeonse_avg: number | null;
    sale_min: number | null;
    sale_max: number | null;
  }>>`
    SELECT
      COUNT(*)::int AS complex_count,
      COALESCE(SUM("txCount12m"), 0)::int AS tx_count,
      AVG("saleAvgPrice12m")::float AS sale_avg,
      AVG("jeonseAvgDeposit12m")::float AS jeonse_avg,
      MIN("saleAvgPrice12m")::float AS sale_min,
      MAX("saleAvgPrice12m")::float AS sale_max
    FROM "Property"
    WHERE "sigunguCode" = ${sigunguCode}
      AND "propertyType" = 'APARTMENT'
      AND "txCount12m" > 0
  `;
  const r = rows[0];
  return {
    complexCount: r?.complex_count ?? 0,
    txCount12m: r?.tx_count ?? 0,
    saleAvgPrice12m: r?.sale_avg != null ? Math.round(r.sale_avg) : null,
    jeonseAvgDeposit12m: r?.jeonse_avg != null ? Math.round(r.jeonse_avg) : null,
    priceMin: r?.sale_min != null ? Math.round(r.sale_min) : null,
    priceMax: r?.sale_max != null ? Math.round(r.sale_max) : null,
  };
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/property.ts
git commit -m "feat(seo): 시군구 단위 아파트 통계 집계(getRegionStats)"
```

---

## Task 5: 지역 서술 (TDD)

**Files:**
- Modify: `lib/seo/blurb.ts` (`regionBlurb` 추가)
- Modify: `tests/lib/blurb.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/lib/blurb.test.ts`에 추가:

```ts
import { regionBlurb, type RegionBlurbInput } from '@/lib/seo/blurb';

const region: RegionBlurbInput = {
  fullName: '서울특별시 송파구',
  complexCount: 320,
  txCount12m: 4100,
  saleAvgPrice12m: 150000,
  jeonseAvgDeposit12m: 80000,
  priceMin: 30000,
  priceMax: 500000,
  topComplexNames: ['헬리오시티', '잠실엘스'],
};

describe('regionBlurb', () => {
  it('지역 통계와 대표 단지를 포함', () => {
    const s = regionBlurb(region);
    expect(s).toContain('서울특별시 송파구');
    expect(s).toContain('320개');
    expect(s).toContain('4,100건');
    expect(s).toContain('헬리오시티');
  });
  it('데이터 없을 때 안전', () => {
    const s = regionBlurb({ ...region, complexCount: 0, txCount12m: 0, saleAvgPrice12m: null, jeonseAvgDeposit12m: null, priceMin: null, priceMax: null, topComplexNames: [] });
    expect(s).toContain('서울특별시 송파구');
    expect(s.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:unit blurb`
Expected: FAIL — `regionBlurb` 없음.

- [ ] **Step 3: 구현 (`lib/seo/blurb.ts`에 추가)**

```ts
export interface RegionBlurbInput {
  fullName: string;
  complexCount: number;
  txCount12m: number;
  saleAvgPrice12m: number | null;
  jeonseAvgDeposit12m: number | null;
  priceMin: number | null;
  priceMax: number | null;
  topComplexNames: string[];
}

export function regionBlurb(i: RegionBlurbInput): string {
  if (i.complexCount === 0) {
    return `${i.fullName}의 아파트 실거래가 정보를 제공합니다. 최근 1년간 신고된 거래가 아직 충분하지 않습니다.`;
  }
  const ratio =
    i.saleAvgPrice12m && i.jeonseAvgDeposit12m
      ? Math.round((i.jeonseAvgDeposit12m / i.saleAvgPrice12m) * 100)
      : null;
  const pricePart = i.saleAvgPrice12m ? ` 평균 매매가는 ${formatBillion(i.saleAvgPrice12m)}` : '';
  const rangePart =
    i.priceMin && i.priceMax ? `(${formatBillion(i.priceMin)}~${formatBillion(i.priceMax)})` : '';
  const ratioPart = ratio ? `, 전세가율은 약 ${ratio}%입니다` : i.saleAvgPrice12m ? '입니다' : '';
  const topPart =
    i.topComplexNames.length > 0
      ? ` 거래가 활발한 단지로는 ${i.topComplexNames.slice(0, 3).join(', ')} 등이 있습니다.`
      : '';

  return `${i.fullName}에는 최근 1년 거래가 있는 아파트가 ${i.complexCount.toLocaleString('ko-KR')}개 단지이며, 총 ${i.txCount12m.toLocaleString('ko-KR')}건이 거래됐습니다.${pricePart}${rangePart}${ratioPart}.${topPart}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:unit blurb`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/blurb.ts tests/lib/blurb.test.ts
git commit -m "feat(seo): 지역 허브 서술 생성 (순수 함수)"
```

---

## Task 6: 지역 페이지에 통계+서술 렌더

**Files:**
- Modify: `app/(public)/region/[code]/page.tsx`

- [ ] **Step 1: import 추가**

```tsx
import { getTopPropertiesByVolume, getRegionStats } from '@/lib/property';
import { regionBlurb } from '@/lib/seo/blurb';
```

(기존 `getTopPropertiesByVolume` import 줄에 `getRegionStats`를 합친다.)

- [ ] **Step 2: 데이터 fetch + 서술 계산**

기존 `apartments` fetch를 통계와 병렬로:

```tsx
  const [apartments, stats] = await Promise.all([
    getTopPropertiesByVolume({
      types: [PropertyType.APARTMENT],
      sigunguCode: region.sigunguCode,
      limit: 12,
    }),
    getRegionStats(region.sigunguCode),
  ]);

  const blurbText = regionBlurb({
    fullName: region.fullName,
    complexCount: stats.complexCount,
    txCount12m: stats.txCount12m,
    saleAvgPrice12m: stats.saleAvgPrice12m,
    jeonseAvgDeposit12m: stats.jeonseAvgDeposit12m,
    priceMin: stats.priceMin,
    priceMax: stats.priceMax,
    topComplexNames: apartments.slice(0, 3).map((p) => p.name),
  });
```

- [ ] **Step 3: h1 아래에 서술 렌더**

```tsx
      <h1 className="mt-2 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        {region.fullName} 부동산 실거래가
      </h1>
      <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text)]">{blurbText}</p>
```

- [ ] **Step 4: 타입체크 + 라이브 확인**

Run: `pnpm typecheck` → 에러 없음. `pnpm dev` → `/region/<code>` 소스에 서술 포함 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/region"
git commit -m "feat(seo): 지역 페이지에 통계 기반 서술 렌더"
```

---

## Task 7: 메타 보정 (법적 페이지 + 빌라)

**Files:**
- Modify: `app/(public)/about/page.tsx`, `contact/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, `data-source/page.tsx`, `sitemap/page.tsx`, `villa/[id]/page.tsx`

- [ ] **Step 1: 법적 페이지 description 추가**

각 파일의 `export const metadata` 객체에 `description`을 추가한다(아래 문구 사용):

- `about/page.tsx`: `description: '임장온 서비스 소개 — 공공데이터 기반 부동산 실거래가·생활편의 정보를 제공하는 방식과 운영 안내.'`
- `contact/page.tsx`: `description: '임장온 문의 — 데이터 정정·삭제 요청, 제휴 등 문의 안내.'`
- `privacy/page.tsx`: `description: '임장온 개인정보 처리방침 — 수집 항목, 이용 목적, 쿠키 및 광고(Google AdSense) 안내.'`
- `terms/page.tsx`: `description: '임장온 이용약관 — 서비스 이용 조건과 데이터 정확성·책임 범위 안내.'`
- `data-source/page.tsx`: `description: '임장온 데이터 출처 — 국토교통부 실거래가, 청약홈, 건강보험심사평가원 등 공공데이터 출처 안내.'`
- `sitemap/page.tsx`: `description: '임장온 사이트맵 — 아파트·오피스텔·연립다세대·지역·생활편의 전체 페이지 안내.'`

예시(about):

```tsx
export const metadata: Metadata = {
  title: '서비스 소개',
  description: '임장온 서비스 소개 — 공공데이터 기반 부동산 실거래가·생활편의 정보를 제공하는 방식과 운영 안내.',
  alternates: { canonical: '/about' },
};
```

- [ ] **Step 2: 빌라 메타 통일 (`villa/[id]/page.tsx`)**

`generateMetadata`를 apt 패턴으로:

```tsx
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  const typeLabel = p.propertyType === 'ROW_HOUSE' ? '연립' : '다세대';
  return {
    title: `${p.name} 실거래가 · ${p.region.fullName}`,
    description: `${p.name}(${typeLabel}). 매매 평균 ${formatBillion(p.saleAvgPrice12m)} · 전세 ${formatBillion(p.jeonseAvgDeposit12m)} · 거래 ${p.txCount12m}건.`,
    alternates: { canonical: `/villa/${p.id}` },
  };
}
```

`formatBillion` import가 없으면 추가: `import { formatBillion } from '@/lib/format';`

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)"
git commit -m "feat(seo): 법적 페이지 description + 빌라 메타 통일"
```

---

## Task 8: 구조화 데이터 확장 (청약 + 시설 필드)

**Files:**
- Modify: `app/(public)/subscription/[id]/page.tsx`
- Modify: `medical/hospital/.../page.tsx`, `medical/pharmacy/.../page.tsx`, `school/.../page.tsx`, `childcare/.../page.tsx`

- [ ] **Step 1: 청약 JSON-LD 추가**

`subscription/[id]/page.tsx`를 열어 상세 데이터(`notice`)의 가용 필드(이름·지역·접수 시작/마감일 등)를 확인한다. `BreadcrumbList` + 경량 스키마를 주입한다. 날짜 필드가 있으면 `Event`(접수기간), 없으면 `WebPage`로 한다. import:

```tsx
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
```

`return (` 직후 최상단에 추가(필드명은 실제 `notice` 객체에 맞춰 사용):

```tsx
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: `${notice.name} 청약 공고`,
            url: `${SITE_URL}/subscription/${notice.id}`,
            ...(notice.regionName ? { about: notice.regionName } : {}),
          },
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '청약·분양', url: `${SITE_URL}/subscription` },
            { name: notice.name, url: `${SITE_URL}/subscription/${notice.id}` },
          ]),
        ]}
      />
```

> 접수 시작/마감 날짜 필드가 존재하면 `WebPage` 대신 `Event`로 바꾸고 `startDate`/`endDate`(ISO)를 채운다. 없으면 위 형태 유지(과설계 금지).

- [ ] **Step 2: 시설 placeSchema 필드 보강**

병원/약국/학교/어린이집 상세에서 `placeSchema(...)` 호출에 가용 필드를 추가한다. 각 페이지의 엔티티 객체에 전화번호/운영시간 필드가 있는지 확인 후, 있으면 전달. `placeSchema` 입력에 없는 필드를 추가하려면 먼저 `lib/seo/json-ld.tsx`의 `PlaceInput`에 옵션 필드를 추가한다:

`lib/seo/json-ld.tsx`의 `interface PlaceInput`에 추가:

```ts
interface PlaceInput {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  image?: string;
  telephone?: string | null;
  openingHours?: string | null;
}
```

`placeSchema` 본문에 매핑 추가(undefined면 JSON에서 자동 제외):

```ts
export function placeSchema(input: PlaceInput & { type: PlaceType }): Json {
  return {
    ...ctx,
    '@type': input.type,
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    telephone: input.telephone ?? undefined,
    openingHours: input.openingHours ?? undefined,
  };
}
```

그런 다음 각 시설 페이지에서 가용 필드를 전달(예: 병원에 전화번호 필드가 있으면 `telephone: hospital.tel`). **필드가 없는 시설은 변경하지 않는다.**

- [ ] **Step 3: 타입체크 + 기존 json-ld 테스트 통과**

Run: `pnpm test:unit json-ld && pnpm typecheck`
Expected: PASS / 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add lib/seo/json-ld.tsx "app/(public)"
git commit -m "feat(seo): 청약 JSON-LD + 시설 스키마 필드 보강"
```

---

## Task 9: 최종 검증

- [ ] **Step 1: 단위 테스트 전체**

Run: `pnpm test:unit`
Expected: 신규 josa·blurb 포함 전부 PASS.

- [ ] **Step 2: 린트 + 타입체크**

Run: `pnpm lint && pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 라이브 HTML 확인 (dev)**

`pnpm dev` 후 JS 없이 curl/소스 보기로 확인:
- 아파트·빌라 상세에 단지 요약 서술 `<p>` 존재
- `/region/<code>`에 지역 서술 존재
- 법적 페이지 `<meta name="description">`가 페이지별 고유 문구
- `/subscription/<id>`에 `application/ld+json` 존재

- [ ] **Step 4: 빌드(선택)**

Run: `pnpm build` (DB/env 필요 — 실패 시 DB 사유면 기록만)

- [ ] **Step 5: PR 생성 / 기존 브랜치에 push**

```bash
git push -u origin feat/seo-content-enrichment
gh pr create --base main --title "feat(seo): 데이터 기반 자동 서술 + 메타·구조화데이터 보정" --body "스펙: docs/superpowers/specs/2026-06-07-seo-content-enrichment-design.md"
```

> PR #67 미머지 상태면 이 브랜치는 #67 위에 쌓여 있으므로, #67 머지 후 `git rebase main`으로 정리하거나 PR base를 #67로 설정한다.

---

## Self-Review 결과

- **스펙 커버리지:** 섹션1(상세 서술)=Task 1·2·3, 섹션2(지역 서술+getRegionStats)=Task 4·5·6, 섹션3(메타)=Task 7, 섹션4(구조화데이터)=Task 8. 전부 매핑.
- **Placeholder:** 청약 스키마 형태(Event vs WebPage)와 시설 전화/운영시간 필드는 "실제 모델 필드 확인 후 가용 시에만"으로 명시 — 추측 코드 대신 검증 단계로 처리(데이터 가용성에 의존하는 항목이라 의도적).
- **타입 일관성:** `PropertyBlurbInput`/`RegionBlurbInput`/`salePriceTrend`/`josa`/`getRegionStats`/`RegionStats` 시그니처가 정의 태스크(1·2·4·5)와 사용 태스크(3·6)에서 일치. `formatBillion`은 만원 단위(기존 사용처와 동일).
