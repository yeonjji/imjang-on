# 단지정보 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영에 적재된 `AptComplex` 데이터를 비율·밀도·연차로 가공해 아파트 상세 화면 세 곳에 놓는다.

**Architecture:** 계산은 DB를 모르는 순수 함수(`lib/insights/apt-complex.ts`)에 모은다. 해석 문장 2개는 기존 `buildAptNarrative`에 얹되 `fired`에서 빼 색인 판정을 그대로 둔다. 화면은 기존 두 곳에 흡수하고 새 컴포넌트는 하나만 만든다.

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma 5, vitest, Playwright

## Global Constraints

- **`lib/seo/indexable.ts`를 수정하지 않는다.** 화이트리스트 전환은 별도 스펙이다.
- **단지 모듈은 `narrative.fired`에 넣지 않는다.** `sentences`에만 넣는다. 이것이 색인 계약이다.
- 단지 문장은 `core`·`extra` **뒤에** 붙인다. `narrative.text.slice(0,150)`이 메타 설명이라 앞을 건드리면 안 된다.
- `lib/insights/apt-complex.ts`는 **DB를 import하지 않는다.** 순수 함수만 둔다.
- 결측 값은 렌더하지 않는다. 빈 타일·"정보 없음" 문구를 두지 않는다.
- 총평("양호한 편")과 공통 단서("실제와 다를 수 있습니다")를 문장에 넣지 않는다.
- `getPropertyById`를 수정하지 않는다 — OG 이미지 생성이 같은 함수를 쓴다.
- 밴드 라벨은 `'60㎡ 이하' | '60~85㎡' | '85~135㎡' | '135㎡ 초과'` 네 개로 고정.
- 스펙: `docs/superpowers/specs/2026-09-09-apt-complex-ui-design.md`

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/insights/apt-complex.ts` | **신규.** 파생 지표 계산·렌더 판정. DB 모름 |
| `lib/property.ts` | **수정.** `getComplexFacts(propertyId)` 추가 |
| `lib/insights/apt.ts` | **수정.** 문장 모듈 2개 + `fired` 제외 |
| `lib/insights/apt-loader.ts` | **수정.** 조회·전달 배선 |
| `lib/data-sources.ts` | **수정.** 단지정보 출처 한 줄 |
| `app/(public)/apt/[id]/_components/complex-info-section.tsx` | **신규.** 타일 그리드 |
| `app/(public)/apt/[id]/_components/area-comparison.tsx` | **수정.** 구성 한 줄 |
| `app/(public)/apt/[id]/_components/detail-sidebar.tsx` | **수정.** 조건부 네비 |
| `app/(public)/{apt,villa,officetel}/[id]/page.tsx` | **수정.** 배선 |

---

## Task 1: 파생 지표 순수 함수

**Files:**
- Create: `lib/insights/apt-complex.ts`
- Test: `tests/lib/apt-complex-insights.test.ts`

**Interfaces:**
- Produces: `ComplexFacts`, `BandLabel`, `UnitMix`, `DensityFacts`, `buildUnitMix`, `buildDensity`, `buildingAgeYears`, `shouldRenderComplexInfo`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lib/apt-complex-insights.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildUnitMix,
  buildDensity,
  buildingAgeYears,
  shouldRenderComplexInfo,
  type ComplexFacts,
} from '@/lib/insights/apt-complex';

/** 헬리오시티 실측값(A10025850). 면적 합 2854+5132+1500+24 = 9510 = 세대수. */
const HELIO: ComplexFacts = {
  households: 9510, buildingCount: 84,
  usedate: new Date('2018-12-28T00:00:00Z'),
  hallType: '혼합식', topFloor: 35, baseFloor: 3,
  area60: 2854, area85: 5132, area135: 1500, area136: 24,
  parkingGround: 0, parkingUnder: 12096,
  evGround: 0, evUnder: 256,
  elevator: 384, cctv: 2685,
  builder: '현대건설,삼성물산,현대산업개발',
  fetchedAt: new Date('2026-09-08T00:00:00Z'),
};
const EMPTY: ComplexFacts = {
  households: null, buildingCount: null, usedate: null, hallType: null,
  topFloor: null, baseFloor: null, area60: null, area85: null,
  area135: null, area136: null, parkingGround: null, parkingUnder: null,
  evGround: null, evUnder: null, elevator: null, cctv: null,
  builder: null, fetchedAt: null,
};

describe('buildUnitMix', () => {
  it('4칸 완비 + 합 일치면 비중을 만든다', () => {
    const m = buildUnitMix(HELIO)!;
    expect(m.bands).toHaveLength(4);
    expect(m.bands.map((b) => b.label)).toEqual(['60㎡ 이하', '60~85㎡', '85~135㎡', '135㎡ 초과']);
    expect(m.bands.map((b) => b.units)).toEqual([2854, 5132, 1500, 24]);
    expect(m.bands.map((b) => b.pct)).toEqual([30, 54, 16, 0]);
  });

  it('85㎡ 이하 비중을 낸다', () => {
    expect(buildUnitMix(HELIO)!.smallMidPct).toBe(84); // 30 + 54
  });

  it('최대 밴드를 dominant로 잡는다', () => {
    expect(buildUnitMix(HELIO)!.dominant).toEqual({ label: '60~85㎡', pct: 54 });
  });

  it('동률이면 작은 면적을 우선한다', () => {
    const m = buildUnitMix({ ...HELIO, households: 200, area60: 100, area85: 100, area135: 0, area136: 0 })!;
    expect(m.dominant.label).toBe('60㎡ 이하');
  });

  it('units 0인 밴드도 배열에 남긴다', () => {
    const m = buildUnitMix({ ...HELIO, households: 100, area60: 100, area85: 0, area135: 0, area136: 0 })!;
    expect(m.bands).toHaveLength(4);
    expect(m.bands[3]).toEqual({ label: '135㎡ 초과', units: 0, pct: 0 });
  });

  it('한 칸이라도 null이면 null', () => {
    expect(buildUnitMix({ ...HELIO, area135: null })).toBeNull();
  });

  it('세대수가 null이면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: null })).toBeNull();
  });

  // 실측 불일치는 0건이지만 원본이 바뀔 때를 위한 가드다.
  it('합이 세대수와 다르면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: 9511 })).toBeNull();
  });

  it('세대수가 0이면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: 0, area60: 0, area85: 0, area135: 0, area136: 0 })).toBeNull();
  });
});

describe('buildDensity', () => {
  it('세대당 주차는 지상+지하를 세대수로 나눈다', () => {
    expect(buildDensity(HELIO).parkingPerHousehold).toBeCloseTo(1.27, 2);
  });

  it('지상 0 · 지하 있음이면 전면 지하주차', () => {
    expect(buildDensity(HELIO).parkingAllUnderground).toBe(true);
  });

  it('지상·지하 둘 다 0이면 전면 지하가 아니다 — 빈 레코드다', () => {
    expect(buildDensity({ ...HELIO, parkingGround: 0, parkingUnder: 0 }).parkingAllUnderground).toBe(false);
  });

  it('지상·지하 중 하나라도 null이면 세대당 주차는 null', () => {
    expect(buildDensity({ ...HELIO, parkingGround: null }).parkingPerHousehold).toBeNull();
  });

  it('승강기는 역수로 낸다 — 9510/384 = 24.8 → 25세대당 1대', () => {
    expect(buildDensity(HELIO).householdsPerElevator).toBe(25);
  });

  it('EV·CCTV는 100세대당으로 낸다', () => {
    expect(buildDensity(HELIO).evPer100).toBeCloseTo(2.7, 1);   // 256/9510*100
    expect(buildDensity(HELIO).cctvPer100).toBeCloseTo(28.2, 1); // 2685/9510*100
  });

  it('세대수가 없으면 밀도는 전부 null', () => {
    const d = buildDensity({ ...HELIO, households: null });
    expect(d.parkingPerHousehold).toBeNull();
    expect(d.evPer100).toBeNull();
    expect(d.householdsPerElevator).toBeNull();
    expect(d.cctvPer100).toBeNull();
  });

  it('세대수가 없어도 전면 지하 판정은 살아 있다 — 구조는 세대수와 무관하다', () => {
    expect(buildDensity({ ...HELIO, households: null }).parkingAllUnderground).toBe(true);
  });

  it('승강기가 0이면 null — 0으로 나눌 수 없다', () => {
    expect(buildDensity({ ...HELIO, elevator: 0 }).householdsPerElevator).toBeNull();
  });
});

describe('buildingAgeYears', () => {
  it('경과 연수를 내림한다', () => {
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-09-09T00:00:00Z'))).toBe(7);
  });
  it('생일 전날이면 아직 이전 해다', () => {
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-12-27T00:00:00Z'))).toBe(7);
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-12-28T00:00:00Z'))).toBe(8);
  });
  it('usedate가 없으면 null', () => {
    expect(buildingAgeYears(null, new Date('2026-09-09T00:00:00Z'))).toBeNull();
  });
  it('미래 준공이면 0', () => {
    expect(buildingAgeYears(new Date('2027-01-01T00:00:00Z'), new Date('2026-09-09T00:00:00Z'))).toBe(0);
  });
});

describe('shouldRenderComplexInfo', () => {
  const now = new Date('2026-09-09T00:00:00Z');
  it('타일이 3개 이상이면 렌더한다', () => {
    expect(shouldRenderComplexInfo(HELIO, now)).toBe(true);
  });
  it('타일이 2개면 숨긴다 — 한두 칸짜리 카드는 빈칸으로 읽힌다', () => {
    const two: ComplexFacts = { ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z') };
    expect(shouldRenderComplexInfo(two, now)).toBe(false);
  });
  it('타일이 3개면 렌더한다', () => {
    const three: ComplexFacts = {
      ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z'), elevator: 20,
    };
    expect(shouldRenderComplexInfo(three, now)).toBe(true);
  });
  it('빈 레코드면 숨긴다', () => {
    expect(shouldRenderComplexInfo(EMPTY, now)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-complex-insights.test.ts`
Expected: FAIL — `Cannot find module '@/lib/insights/apt-complex'`

- [ ] **Step 3: `lib/insights/apt-complex.ts`를 구현한다**

```ts
/**
 * 단지정보 파생 지표. **DB를 모른다.**
 *
 * 원자료를 그대로 쓰지 않는다. "주차 12,096대"가 아니라 "세대당 1.27대",
 * "승강기 384대"가 아니라 "25세대당 1대"로 바꾼다. 나눗셈 방향은 값마다 다르다 —
 * 주차·EV·CCTV는 세대당이 직관적이고, 승강기는 역수라야 읽힌다(0.04대 vs 25세대당 1대).
 */

export type BandLabel = '60㎡ 이하' | '60~85㎡' | '85~135㎡' | '135㎡ 초과';

export interface ComplexFacts {
  households: number | null;
  buildingCount: number | null;
  usedate: Date | null;
  hallType: string | null;
  topFloor: number | null;
  baseFloor: number | null;
  area60: number | null;
  area85: number | null;
  area135: number | null;
  area136: number | null;
  parkingGround: number | null;
  parkingUnder: number | null;
  evGround: number | null;
  evUnder: number | null;
  elevator: number | null;
  cctv: number | null;
  builder: string | null;
  /** 출처 캡션의 기준일. 수집이 수동이라 데이터는 이 시점 기준이다. */
  fetchedAt: Date | null;
}

export interface UnitMix {
  /** 항상 4개. units 0인 밴드도 남긴다(구성 바에서 자리를 차지해야 한다). */
  bands: { label: BandLabel; units: number; pct: number }[];
  /** 85㎡ 이하 비중 — 중소형/중대형 판정 근거. */
  smallMidPct: number;
  /** 최대 밴드. 동률이면 작은 면적 우선. */
  dominant: { label: BandLabel; pct: number };
}

export interface DensityFacts {
  parkingPerHousehold: number | null;
  /** 지상 0 **그리고** 지하 > 0. 둘 다 0인 빈 레코드를 '전면 지하'로 읽으면 안 된다. */
  parkingAllUnderground: boolean;
  evPer100: number | null;
  /** 역수 — "N세대당 1대". */
  householdsPerElevator: number | null;
  cctvPer100: number | null;
}

const BANDS: BandLabel[] = ['60㎡ 이하', '60~85㎡', '85~135㎡', '135㎡ 초과'];

/**
 * 면적 구성. **4칸 완비 + 합이 세대수와 정확히 일치할 때만** 만든다.
 * 운영 실측(2026-09-08, 22,301건)에서 불일치는 0건이라 이 검사는 통과 전용이지만,
 * 비중을 %로 보이는 순간 합이 100%가 아니면 들통나므로 가드를 남긴다.
 */
export function buildUnitMix(f: ComplexFacts): UnitMix | null {
  const units = [f.area60, f.area85, f.area135, f.area136];
  if (units.some((u) => u == null)) return null;
  if (f.households == null || f.households <= 0) return null;
  const total = units.reduce((a, b) => a! + b!, 0)!;
  if (total !== f.households) return null;

  const bands = BANDS.map((label, i) => ({
    label,
    units: units[i]!,
    pct: Math.round((units[i]! / total) * 100),
  }));

  let dominant = bands[0];
  for (const b of bands) if (b.units > dominant.units) dominant = b; // 동률이면 앞(작은 면적) 유지
  return {
    bands,
    smallMidPct: bands[0].pct + bands[1].pct,
    dominant: { label: dominant.label, pct: dominant.pct },
  };
}

const per = (n: number | null, households: number | null): number | null =>
  n == null || households == null || households <= 0 ? null : n / households;

export function buildDensity(f: ComplexFacts): DensityFacts {
  // 지상·지하 중 하나라도 없으면 총합을 알 수 없다. 모르는 값을 0으로 치면 과소 집계다.
  const parkTotal = f.parkingGround != null && f.parkingUnder != null ? f.parkingGround + f.parkingUnder : null;
  const evTotal = f.evGround != null && f.evUnder != null ? f.evGround + f.evUnder : null;
  const evRatio = per(evTotal, f.households);
  const cctvRatio = per(f.cctv, f.households);

  return {
    parkingPerHousehold: per(parkTotal, f.households),
    parkingAllUnderground: f.parkingGround === 0 && (f.parkingUnder ?? 0) > 0,
    evPer100: evRatio == null ? null : evRatio * 100,
    householdsPerElevator:
      f.elevator == null || f.elevator <= 0 || f.households == null
        ? null
        : Math.round(f.households / f.elevator),
    cctvPer100: cctvRatio == null ? null : cctvRatio * 100,
  };
}

/**
 * 준공 연차. **기준일을 인자로 받는다** — 안에서 new Date()를 부르면 해가 바뀔 때
 * 테스트가 저절로 깨진다. 월 단위를 버리는 건 ISR 때문이다: 렌더 시점 값이 캐시에
 * 박제되므로 정밀할수록 오래 틀린다.
 */
export function buildingAgeYears(usedate: Date | null, now: Date): number | null {
  if (!usedate) return null;
  let years = now.getUTCFullYear() - usedate.getUTCFullYear();
  const before =
    now.getUTCMonth() < usedate.getUTCMonth() ||
    (now.getUTCMonth() === usedate.getUTCMonth() && now.getUTCDate() < usedate.getUTCDate());
  if (before) years--;
  return Math.max(0, years);
}

/**
 * 「단지 정보」 섹션을 띄울지. **타일 3개 미만이면 숨긴다.**
 * 한두 칸짜리 카드는 정보가 아니라 빈칸으로 읽히고, 그런 페이지가 느는 것이 곧 얇은 콘텐츠다.
 * 본문과 사이드바 네비가 갈리지 않도록 판정을 여기 하나로 모은다.
 */
export function shouldRenderComplexInfo(f: ComplexFacts | null, now: Date): boolean {
  if (!f) return false;
  const d = buildDensity(f);
  const tiles = [
    d.parkingPerHousehold,
    buildingAgeYears(f.usedate, now),
    d.householdsPerElevator,
    d.evPer100,
    d.cctvPer100,
    f.households,
  ];
  return tiles.filter((t) => t != null).length >= 3;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-complex-insights.test.ts`
Expected: PASS (24개)

- [ ] **Step 5: 커밋**

```bash
git add lib/insights/apt-complex.ts tests/lib/apt-complex-insights.test.ts
git commit -m "feat(apt-complex): 파생 지표 순수 함수

원자료를 그대로 쓰지 않는다. 나눗셈 방향은 값마다 다르다 — 주차·EV·CCTV는
세대당이 직관적이고 승강기는 역수라야 읽힌다(0.04대 vs 25세대당 1대).

면적 구성은 4칸 완비 + 합 일치일 때만 만든다. 운영 실측 불일치는 0건이라
통과 전용 가드지만, 비중을 %로 보이는 순간 합이 100%가 아니면 들통난다.

buildingAgeYears는 기준일을 인자로 받는다. 안에서 new Date()를 부르면 해가
바뀔 때 테스트가 저절로 깨진다."
```

---

## Task 2: 조회와 로더 배선

**Files:**
- Modify: `lib/property.ts`
- Modify: `lib/insights/apt-loader.ts`

**Interfaces:**
- Consumes: `ComplexFacts` from `@/lib/insights/apt-complex`
- Produces: `getComplexFacts(propertyId: bigint): Promise<ComplexFacts | null>`, `loadAptInsight`가 `{ narrative, dateModified, complexFacts }`를 반환

- [ ] **Step 1: `lib/property.ts`에 조회를 추가한다**

`getPropertyById` 바로 아래에 붙인다.

```ts
/**
 * 단지정보(AptComplex) 1:1 조회. 매칭 안 된 Property는 null이다(아파트의 약 72%).
 *
 * getPropertyById의 include에 얹지 않는다 — OG 이미지 생성이 같은 함수를 쓰는데
 * 거기서는 단지정보가 필요 없다.
 */
export async function getComplexFacts(propertyId: bigint): Promise<ComplexFacts | null> {
  const row = await prisma.aptComplex.findUnique({
    where: { propertyId },
    select: {
      households: true, buildingCount: true, usedate: true, hallType: true,
      topFloor: true, baseFloor: true,
      area60: true, area85: true, area135: true, area136: true,
      parkingGround: true, parkingUnder: true,
      evGround: true, evUnder: true, elevator: true, cctv: true,
      builder: true, fetchedAt: true,
    },
  });
  return row;
}
```

파일 상단 import에 추가:

```ts
import type { ComplexFacts } from '@/lib/insights/apt-complex';
```

- [ ] **Step 2: 로더에 배선한다**

`lib/insights/apt-loader.ts`의 import에 추가:

```ts
import { getPropertyById, getPropertyLatLng, getRegionStats, hasSingleJibun, getComplexFacts } from '@/lib/property';
import type { ComplexFacts } from '@/lib/insights/apt-complex';
```

캐시 별칭을 추가한다(`cachedTransactionFlags` 아래):

```ts
export const cachedComplexFacts = cache(getComplexFacts);
```

`Promise.all` 배열 끝에 `cachedComplexFacts(propId)`를 넣고 구조분해에 `complexFacts`를 더한다:

```ts
    const [salesResult, region, subway, infra, areaSummary, latestTx, floorPremium, flags, complexFacts] =
      await Promise.all([
        // ... 기존 8개 그대로 ...
        cachedComplexFacts(propId),
      ]);
```

반환 타입과 값에 `complexFacts`를 더한다:

```ts
  async (propId: bigint): Promise<{
    narrative: AptNarrative | null;
    dateModified?: string;
    complexFacts: ComplexFacts | null;
  }> => {
    const property = await cachedPropertyById(propId);
    if (!property) return { narrative: null, complexFacts: null };
    // ...
    return { narrative, dateModified, complexFacts };
```

- [ ] **Step 3: 타입체크·린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과. 실패하면 `loadAptInsight`를 쓰는 3개 페이지(apt·villa·officetel)의 구조분해를 확인한다 — 기존 `const { narrative } = ...`는 그대로 동작한다.

- [ ] **Step 4: 실데이터로 조회를 확인한다**

로컬 DB에는 매칭 결과가 없으므로 운영 읽기전용 터널을 쓴다(절차는 메모리 `feedback_readonly_tunnel_qa`).

```bash
ssh -f -N -L 55432:127.0.0.1:5432 ubuntu@<box>
# .env.prod.local (반드시 .env.*.local — .gitignore 대상)
pnpm exec dotenv -e .env.prod.local -- tsx -e "
import { getComplexFacts } from '@/lib/property';
import { prisma } from '@/lib/db';
const id = (await prisma.aptComplex.findFirst({ where: { propertyId: { not: null }, households: { not: null } }, select: { propertyId: true } }))!.propertyId!;
console.log(await getComplexFacts(id));
await prisma.\$disconnect();
"
```
Expected: 세대수·동수·주차 등이 채워진 객체 하나. 끝나면 터널 종료 + env 삭제.

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts lib/insights/apt-loader.ts
git commit -m "feat(apt-complex): 단지정보 조회·로더 배선

getPropertyById의 include에 얹지 않는다 — OG 이미지 생성이 같은 함수를 쓰는데
거기서는 단지정보가 필요 없다. 별도 함수 + 요청 스코프 캐시로 둔다.

매칭 안 된 Property는 null이다(아파트의 약 72%). villa·officetel은 애초에
매칭 대상이 아니라 자연히 같은 경로를 탄다."
```

---

## Task 3: 해석 문장 2개와 색인 계약

**Files:**
- Modify: `lib/insights/apt.ts`
- Test: `tests/lib/apt-complex-narrative.test.ts`

**Interfaces:**
- Consumes: `UnitMix`, `DensityFacts` from `@/lib/insights/apt-complex`
- Produces: `AptInsightInput`에 `unitMix?: UnitMix | null`·`density?: DensityFacts | null` 추가. `buildAptNarrative` 반환의 `sentences`는 늘고 `fired`는 그대로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lib/apt-complex-narrative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAptNarrative } from '@/lib/insights/apt';
import type { UnitMix, DensityFacts } from '@/lib/insights/apt-complex';

/** 색인 게이트(발화 3 + trend|peer)를 통과하는 최소 입력. */
const BASE = {
  name: '헬리오시티',
  sigunguName: '송파구',
  builtYear: 2018,
  households: 9510,
  saleDeals: [
    { contractDate: '2025-01-10', amountManwon: 180000 },
    { contractDate: '2026-01-10', amountManwon: 200000 },
  ],
  saleTrend: { changePct: 11, pyeong: 34, sampleCount: 12 },
  regionAvgSaleManwon: 150000,
  regionSampleCount: 40,
  nearestStation: { name: '송파역', lines: ['8호선'], distanceMeters: 300 },
  infra: [
    { label: '병원', count: 12, capped: false },
    { label: '마트', count: 3, capped: false },
    { label: '공원', count: 2, capped: false },
  ],
};

/**
 * 분기 조건만 통제하는 합성 UnitMix. bands의 개별 비중은 문장 분기에 쓰이지 않지만
 * (분기는 smallMidPct와 dominant.pct만 본다) 음수가 나오지 않게 맞춰 둔다.
 */
const mix = (smallMidPct: number, dominantPct: number, label: UnitMix['dominant']['label']): UnitMix => {
  const small = Math.min(smallMidPct, dominantPct);
  return {
    bands: [
      { label: '60㎡ 이하', units: 1, pct: smallMidPct - small },
      { label: '60~85㎡', units: 1, pct: small },
      { label: '85~135㎡', units: 1, pct: 100 - smallMidPct },
      { label: '135㎡ 초과', units: 0, pct: 0 },
    ],
    smallMidPct,
    dominant: { label, pct: dominantPct },
  };
};

const density = (p: Partial<DensityFacts>): DensityFacts => ({
  parkingPerHousehold: null, parkingAllUnderground: false,
  evPer100: null, householdsPerElevator: null, cctvPer100: null, ...p,
});

describe('색인 계약', () => {
  it('단지 모듈은 fired에 들어가지 않는다', () => {
    const n = buildAptNarrative({
      ...BASE,
      unitMix: mix(84, 54, '60~85㎡'),
      density: density({ parkingPerHousehold: 1.27, parkingAllUnderground: true }),
    })!;
    expect(n.fired).not.toContain('unitMix');
    expect(n.fired).not.toContain('parking');
    expect(n.sentences.length).toBeGreaterThan(n.fired.length);
  });

  it('단지 문장을 넣어도 fired 개수가 변하지 않는다', () => {
    const without = buildAptNarrative(BASE)!;
    const withMix = buildAptNarrative({
      ...BASE,
      unitMix: mix(84, 54, '60~85㎡'),
      density: density({ parkingPerHousehold: 1.27 }),
    })!;
    expect(withMix.fired).toEqual(without.fired);
    expect(withMix.sentences.length).toBe(without.sentences.length + 2);
  });

  it('단지 문장은 맨 뒤에 붙는다 — 메타 설명(앞 150자)을 건드리지 않는다', () => {
    const n = buildAptNarrative({ ...BASE, unitMix: mix(84, 54, '60~85㎡') })!;
    expect(n.sentences[n.sentences.length - 1]).toContain('중소형');
  });
});

describe('unitMixInsight — 구간 경계', () => {
  const say = (m: UnitMix | null) => {
    const n = buildAptNarrative({ ...BASE, unitMix: m });
    return n?.sentences.find((s) => s.includes('전용')) ?? null;
  };

  it('dominant 90% 이상이면 단일 면적대', () => {
    expect(say(mix(95, 90, '60~85㎡'))).toContain('한 종류');
    expect(say(mix(95, 91, '60~85㎡'))).toContain('한 종류');
  });
  it('dominant 89%면 단일이 아니다', () => {
    expect(say(mix(95, 89, '60~85㎡'))).not.toContain('한 종류');
  });
  it('85㎡ 이하 80% 이상이면 중소형 중심', () => {
    expect(say(mix(80, 54, '60~85㎡'))).toContain('중소형 중심');
    expect(say(mix(84, 54, '60~85㎡'))).toContain('중소형 중심');
  });
  it('79%면 중소형 중심이 아니다', () => {
    expect(say(mix(79, 54, '60~85㎡'))).not.toContain('중소형 중심');
  });
  it('85㎡ 이하 35% 이하면 중대형', () => {
    expect(say(mix(35, 54, '85~135㎡'))).toContain('중대형');
    expect(say(mix(29, 54, '85~135㎡'))).toContain('중대형');
  });
  it('36%면 중대형이 아니라 혼합이다', () => {
    expect(say(mix(36, 54, '60~85㎡'))).toContain('고르게');
  });
  it('unitMix가 null이면 문장이 없다', () => {
    expect(say(null)).toBeNull();
  });
});

describe('parkingInsight — 구간 경계', () => {
  const say = (d: DensityFacts) => {
    const n = buildAptNarrative({ ...BASE, density: d });
    return n?.sentences.find((s) => s.includes('주차')) ?? null;
  };

  it('1.5 이상이면 넉넉한 편', () => {
    expect(say(density({ parkingPerHousehold: 1.8 }))).toContain('넉넉한 편');
  });
  it('1.27이면 수치만 말한다', () => {
    const s = say(density({ parkingPerHousehold: 1.27 }))!;
    expect(s).toContain('1.27대');
    expect(s).not.toContain('넉넉');
    expect(s).not.toContain('못 미칩니다');
  });
  it('1.0 미만이면 못 미친다고 말한다', () => {
    expect(say(density({ parkingPerHousehold: 0.8 }))).toContain('못 미칩니다');
  });
  it('전면 지하면 구조를 덧붙인다', () => {
    expect(say(density({ parkingPerHousehold: 1.27, parkingAllUnderground: true }))).toContain('전부 지하');
  });
  it('총평·단서 문구를 쓰지 않는다', () => {
    const s = say(density({ parkingPerHousehold: 1.27 }))!;
    expect(s).not.toContain('양호');
    expect(s).not.toContain('다를 수 있');
  });
  it('세대당 주차가 null이면 문장이 없다', () => {
    expect(say(density({}))).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-complex-narrative.test.ts`
Expected: FAIL — `unitMix` 속성이 `AptInsightInput`에 없다는 타입 오류 또는 문장 미발화

- [ ] **Step 3: `lib/insights/apt.ts`를 수정한다**

import 추가:

```ts
import type { UnitMix, DensityFacts } from '@/lib/insights/apt-complex';
```

`AptInsightInput`에 필드 추가(`flags?` 아래):

```ts
  /** 단지정보 해석용. 색인 판정에는 쓰이지 않는다(fired 제외). */
  unitMix?: UnitMix | null;
  density?: DensityFacts | null;
```

`flagsInsight` 아래에 모듈 두 개를 추가한다:

```ts
// U: 면적 구성 — 공급 기준 비중. 구간별로 문장이 갈린다.
// 실거래와 자동으로 연결하지 않는다: 우리 실거래는 평 단위이고 API 구성은 ㎡ 밴드라
// 전용 85㎡(=25.7평) 경계에서 "26평"이 어느 밴드인지 단정할 수 없다.
// 대조는 화면에서 '면적별 실거래 비교' 옆에 나란히 놓아 눈으로 하게 한다.
function unitMixInsight(d: AptInsightInput): Insight | null {
  const m = d.unitMix;
  if (!m) return null;
  if (m.dominant.pct >= 90) {
    return { key: 'unitMix', text: `전용 ${m.dominant.label} 한 종류로 이루어진 단지입니다.` };
  }
  if (m.smallMidPct >= 80) {
    return { key: 'unitMix', text: `전용 85㎡ 이하가 ${m.smallMidPct}%인 중소형 중심 단지입니다.` };
  }
  if (m.smallMidPct <= 35) {
    return { key: 'unitMix', text: `전용 85㎡ 초과가 ${100 - m.smallMidPct}%로 중대형 비중이 높은 단지입니다.` };
  }
  const rest = m.bands.filter((b) => b.label !== m.dominant.label && b.units > 0).sort((a, b) => b.pct - a.pct)[0];
  const restPart = rest ? `, ${rest.label} ${rest.pct}%` : '';
  return {
    key: 'unitMix',
    text: `전용 ${m.dominant.label} ${m.dominant.pct}%${restPart}로 면적대가 고르게 섞여 있습니다.`,
  };
}

// K: 주차 밀도. 총평("양호")과 공통 단서("실제와 다를 수 있습니다")를 쓰지 않는다 —
// 전자는 데이터로 뒷받침되지 않고, 후자는 모든 페이지에 똑같이 붙어 그 자체가 near-duplicate다.
function parkingInsight(d: AptInsightInput): Insight | null {
  const den = d.density;
  if (!den || den.parkingPerHousehold == null) return null;
  const v = den.parkingPerHousehold.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  const head =
    den.parkingPerHousehold >= 1.5
      ? `세대당 주차는 ${v}대로 넉넉한 편입니다.`
      : den.parkingPerHousehold >= 1.0
        ? `세대당 주차는 ${v}대입니다.`
        : `세대당 주차는 ${v}대로 세대 수에 못 미칩니다.`;
  const tail = den.parkingAllUnderground ? ' 주차는 전부 지하에 있습니다.' : '';
  return { key: 'parking', text: `${head}${tail}` };
}
```

`buildAptNarrative`의 조립부를 바꾼다:

```ts
  const extra = [floorPremiumInsight, flagsInsight].map((fn) => fn(d)).filter(Boolean) as Insight[];
  // 단지정보 해석. sentences에만 들어가고 fired에는 안 들어간다 —
  // 이것이 색인 계약이다(스펙 §4.1). lib/seo/indexable.ts는 fired만 센다.
  const complex = [unitMixInsight, parkingInsight].map((fn) => fn(d)).filter(Boolean) as Insight[];
  const mods = [...core, ...extra];
  const all = [...mods, ...complex];
  const sentences = all.map((m, i) => (i === 0 ? `${josa(d.name, '은', '는')} ${m.text}` : m.text));
  return { sentences, text: sentences.join(' '), fired: mods.map((m) => m.key) };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-complex-narrative.test.ts tests/lib/`
Expected: 신규 20개 PASS, 기존 `insights-apt.test.ts`도 PASS(단지 입력이 없으면 문장이 안 늘어난다)

- [ ] **Step 5: 커밋**

```bash
git add lib/insights/apt.ts tests/lib/apt-complex-narrative.test.ts
git commit -m "feat(apt-complex): 해석 문장 2개 + 색인 계약

sentences에만 넣고 fired에는 안 넣는다. fired를 읽는 곳이
isNarrativeIndexable 하나뿐임을 실측 확인했으므로 이것만으로 색인 판정이
그대로다. indexable.ts는 수정하지 않는다.

맨 뒤에 붙이는 이유는 메타 설명(text.slice(0,150)) 때문이다.
기존 floorPremium·flags와 같은 자리다.

실거래와 자동으로 연결하지 않는다 — 우리 실거래는 평이고 API 구성은 ㎡ 밴드라
전용 85㎡(=25.7평) 경계에서 '26평'이 어느 밴드인지 단정할 수 없다.

총평('양호')과 공통 단서('실제와 다를 수 있습니다')를 쓰지 않는다. 전자는
데이터로 뒷받침되지 않고 후자는 모든 페이지에 똑같이 붙어 near-duplicate가 된다."
```

---

## Task 4: 「단지 정보」 섹션 신설

**Files:**
- Modify: `lib/data-sources.ts`
- Create: `app/(public)/apt/[id]/_components/complex-info-section.tsx`
- Test: `tests/components/complex-info-section.test.tsx`

**Interfaces:**
- Consumes: `ComplexFacts`, `buildDensity`, `buildingAgeYears`, `shouldRenderComplexInfo`
- Produces: `<ComplexInfoSection facts={ComplexFacts | null} now={Date} id?: string />`

- [ ] **Step 1: `lib/data-sources.ts`에 출처를 추가한다**

기존 항목 형식을 그대로 따른다(파일을 열어 인접 항목의 키 이름을 확인하고 맞춘다). 추가할 값:

```ts
  'molit-apt-complex': {
    name: '국토교통부 공동주택 단지정보',
    shortLabel: '국토교통부',
    url: 'https://www.data.go.kr/data/15058453/openapi.do',
  },
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/components/complex-info-section.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ComplexInfoSection } from '@/app/(public)/apt/[id]/_components/complex-info-section';
import type { ComplexFacts } from '@/lib/insights/apt-complex';

const NOW = new Date('2026-09-09T00:00:00Z');
const EMPTY: ComplexFacts = {
  households: null, buildingCount: null, usedate: null, hallType: null,
  topFloor: null, baseFloor: null, area60: null, area85: null, area135: null,
  area136: null, parkingGround: null, parkingUnder: null, evGround: null,
  evUnder: null, elevator: null, cctv: null, builder: null, fetchedAt: null,
};
const HELIO: ComplexFacts = {
  ...EMPTY,
  households: 9510, buildingCount: 84,
  usedate: new Date('2018-12-28T00:00:00Z'),
  hallType: '혼합식', topFloor: 35, baseFloor: 3,
  parkingGround: 0, parkingUnder: 12096,
  evGround: 0, evUnder: 256, elevator: 384, cctv: 2685,
  builder: '현대건설,삼성물산,현대산업개발',
  fetchedAt: new Date('2026-09-08T00:00:00Z'),
};

const html = (f: ComplexFacts | null) =>
  renderToStaticMarkup(<ComplexInfoSection facts={f} now={NOW} />);

describe('ComplexInfoSection', () => {
  it('facts가 null이면 아무것도 렌더하지 않는다 — 빈 카드도 아니다', () => {
    expect(html(null)).toBe('');
  });

  it('타일이 2개면 섹션 전체를 숨긴다', () => {
    expect(html({ ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z') })).toBe('');
  });

  it('가공값을 보여준다 — 원자료가 아니다', () => {
    const out = html(HELIO);
    expect(out).toContain('1.27대');      // 세대당 주차
    expect(out).toContain('7년차');        // 준공 연차
    expect(out).toContain('25세대당');     // 승강기 — 384대가 아니라 밀도로
    expect(out).toContain('100세대당');    // EV·CCTV
    expect(out).not.toContain('12,096');  // 원자료 주차 대수는 안 보여준다
    expect(out).not.toContain('384');     // 원자료 승강기 대수도 안 보여준다
  });

  it('전면 지하주차를 표기한다', () => {
    expect(html(HELIO)).toContain('전부 지하');
  });

  it('구조와 시공사를 보여준다', () => {
    const out = html(HELIO);
    expect(out).toContain('혼합식');
    expect(out).toContain('35층');
    expect(out).toContain('현대건설');
  });

  it('결측 타일은 렌더하지 않는다', () => {
    const noCctv = html({ ...HELIO, cctv: null });
    expect(noCctv).not.toContain('CCTV');
    expect(noCctv).toContain('1.27'); // 나머지는 그대로
  });

  it('출처와 수집 기준일을 표기한다', () => {
    const out = html(HELIO);
    expect(out).toContain('국토교통부');
    expect(out).toContain('2026-09-08');
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/complex-info-section.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 컴포넌트를 구현한다**

```tsx
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import {
  buildDensity,
  buildingAgeYears,
  shouldRenderComplexInfo,
  type ComplexFacts,
} from '@/lib/insights/apt-complex';

interface Tile {
  key: string;
  label: string;
  value: string;
  sub?: string;
}

/**
 * 단지 정보 — 가공값이 주인이고 원자료는 보조다.
 * "주차 12,096대"가 아니라 "세대당 1.27대 / 전부 지하"로 보여준다.
 *
 * facts가 없거나 타일이 3개 미만이면 아무것도 렌더하지 않는다. 한두 칸짜리 카드는
 * 정보가 아니라 빈칸으로 읽히고, 그런 페이지가 느는 것이 곧 얇은 콘텐츠다.
 */
export function ComplexInfoSection({
  facts,
  now,
  id,
}: {
  facts: ComplexFacts | null;
  now: Date;
  id?: string;
}) {
  if (!shouldRenderComplexInfo(facts, now)) return null;
  const f = facts!;
  const d = buildDensity(f);
  const age = buildingAgeYears(f.usedate, now);

  const tiles: Tile[] = [];
  if (d.parkingPerHousehold != null) {
    tiles.push({
      key: 'parking',
      label: '세대당 주차',
      value: `${d.parkingPerHousehold.toFixed(2)}대`,
      sub: d.parkingAllUnderground ? '전부 지하' : undefined,
    });
  }
  if (age != null) {
    tiles.push({
      key: 'age',
      label: '준공',
      value: `${age}년차`,
      sub: f.usedate ? `${f.usedate.getUTCFullYear()}년` : undefined,
    });
  }
  if (d.householdsPerElevator != null) {
    tiles.push({ key: 'elev', label: '승강기', value: `${d.householdsPerElevator}세대당`, sub: '1대' });
  }
  if (d.evPer100 != null) {
    tiles.push({ key: 'ev', label: 'EV 충전', value: '100세대당', sub: `${d.evPer100.toFixed(1)}기` });
  }
  if (d.cctvPer100 != null) {
    tiles.push({ key: 'cctv', label: 'CCTV', value: '100세대당', sub: `${d.cctvPer100.toFixed(0)}대` });
  }
  if (f.households != null) {
    tiles.push({
      key: 'scale',
      label: '규모',
      value: `${f.households.toLocaleString('ko-KR')}세대`,
      sub: f.buildingCount != null ? `${f.buildingCount}개 동` : undefined,
    });
  }

  const structure = [
    f.hallType,
    f.topFloor != null
      ? `지상 ${f.topFloor}층${f.baseFloor != null ? ` / 지하 ${f.baseFloor}층` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">단지 정보</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.key} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">{t.label}</p>
            <p className="mt-1 text-[17px] font-bold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {structure.length > 0 && (
        <p className="mt-4 break-keep text-sm text-[var(--color-text)]">{structure.join(' · ')}</p>
      )}
      {f.builder && (
        <p className="mt-1 break-keep text-sm text-[var(--color-muted)]">
          시공사 {f.builder.split(',').map((s) => s.trim()).filter(Boolean).join(' · ')}
        </p>
      )}
      <SourceCaption ids={['molit-apt-complex']} />
      {f.fetchedAt && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {f.fetchedAt.toISOString().slice(0, 10)} 수집
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/complex-info-section.test.tsx`
Expected: PASS (7개)

`SourceCaption`의 `ids` 타입이 맞지 않으면 Step 1에서 추가한 키 이름을 `lib/data-sources.ts`의 실제 형식과 대조한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/data-sources.ts "app/(public)/apt/[id]/_components/complex-info-section.tsx" tests/components/complex-info-section.test.tsx
git commit -m "feat(apt-complex): 단지 정보 섹션

가공값이 주인이고 원자료는 보조다. '주차 12,096대'가 아니라
'세대당 1.27대 / 전부 지하'로 보여준다.

타일이 3개 미만이면 섹션 전체를 숨긴다. 한두 칸짜리 카드는 정보가 아니라
빈칸으로 읽히고, 그런 페이지가 느는 것이 곧 얇은 콘텐츠다.

수집이 수동이라 데이터는 마지막 수집 시점 기준이므로 fetchedAt을 함께 표기한다."
```

---

## Task 5: 「면적별 실거래 비교」에 구성 한 줄

**Files:**
- Modify: `app/(public)/apt/[id]/_components/area-comparison.tsx`
- Test: `tests/components/area-comparison-unit-mix.test.tsx`

**Interfaces:**
- Consumes: `UnitMix` from `@/lib/insights/apt-complex`
- Produces: `<AreaComparison areas={...} unitMix={UnitMix | null} id?: string />`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/components/area-comparison-unit-mix.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AreaComparison } from '@/app/(public)/apt/[id]/_components/area-comparison';
import type { UnitMix } from '@/lib/insights/apt-complex';
import type { AreaSummaryItem } from '@/lib/transaction';

// 캐스트 없이 완전한 객체를 만든다. 필드를 빠뜨리면 컴파일이 잡아 준다.
const AREAS: AreaSummaryItem[] = [
  {
    area: 34, lastPrice: 200000, avg12m: 195000, count12m: 12,
    avgPrior12m: 185000, countPrior12m: 10, changePct12m: 5.2,
    jeonseAvg12m: 107000, jeonseCount12m: 8, jeonseRatioPct: 55, gap12m: 90000,
  },
];

const MIX: UnitMix = {
  bands: [
    { label: '60㎡ 이하', units: 2854, pct: 30 },
    { label: '60~85㎡', units: 5132, pct: 54 },
    { label: '85~135㎡', units: 1500, pct: 16 },
    { label: '135㎡ 초과', units: 24, pct: 0 },
  ],
  smallMidPct: 84,
  dominant: { label: '60~85㎡', pct: 54 },
};

describe('AreaComparison — 단지 구성', () => {
  it('unitMix가 있으면 구성 줄을 보여준다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={MIX} />);
    expect(out).toContain('단지 구성');
    expect(out).toContain('60~85㎡');
    expect(out).toContain('54%');
  });

  it('unitMix가 null이면 구성 줄만 빠지고 기존 카드는 남는다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={null} />);
    expect(out).not.toContain('단지 구성');
    expect(out).toContain('면적별 실거래 비교');
  });

  it('units 0인 밴드는 바에서 생략한다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={MIX} />);
    expect(out).not.toContain('135㎡ 초과');
  });

  it('areas가 비어도 unitMix가 있으면 섹션이 뜬다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={[]} unitMix={MIX} />);
    expect(out).toContain('단지 구성');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/area-comparison-unit-mix.test.tsx`
Expected: FAIL — `unitMix` prop 없음

- [ ] **Step 3: 컴포넌트를 수정한다**

import 추가:

```tsx
import type { UnitMix } from '@/lib/insights/apt-complex';
```

시그니처와 조기 반환을 바꾼다:

```tsx
export function AreaComparison({
  areas,
  unitMix,
  id,
}: {
  areas: AreaSummaryItem[];
  unitMix?: UnitMix | null;
  id?: string;
}) {
  // 구성만 있어도 섹션은 의미가 있다(공급 구성은 거래가 없어도 사실이다).
  if (areas.length === 0 && !unitMix) return null;
```

`<h2>` 바로 아래에 구성 블록을 넣는다:

```tsx
      {unitMix && (
        <div className="mb-4 rounded-2xl bg-[var(--color-sky-soft)] p-4">
          <p className="text-xs font-bold text-[var(--color-blue-dark)]">단지 구성</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--color-line)]">
            {unitMix.bands
              .filter((b) => b.units > 0)
              .map((b, i) => (
                <div
                  key={b.label}
                  style={{ width: `${b.pct}%` }}
                  className={i % 2 === 0 ? 'bg-[var(--color-blue)]' : 'bg-[var(--color-blue-dark)]'}
                />
              ))}
          </div>
          <p className="mt-2 break-keep text-xs text-[var(--color-muted)]">
            {unitMix.bands
              .filter((b) => b.units > 0)
              .map((b) => `${b.label} ${b.pct}%`)
              .join(' · ')}
          </p>
        </div>
      )}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/`
Expected: 신규 4개 PASS, 기존 컴포넌트 테스트도 PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/area-comparison.tsx" tests/components/area-comparison-unit-mix.test.tsx
git commit -m "feat(apt-complex): 면적별 실거래 비교에 단지 구성 한 줄

위는 공급된 구성, 아래는 거래된 평형이라 나란히 놓는 것만으로 대조가 생긴다.
자동 문장으로 연결하지 않는 건 평↔㎡ 경계가 어긋나기 때문이다.

제목과 앵커(#area)는 그대로 둔다 — detail-sidebar의 ANCHORS가 참조한다."
```

---

## Task 6: 페이지·사이드바 배선

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`
- Modify: `app/(public)/villa/[id]/page.tsx`
- Modify: `app/(public)/officetel/[id]/page.tsx`
- Modify: `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

**Interfaces:**
- Consumes: `loadAptInsight`가 반환하는 `complexFacts`, `ComplexInfoSection`, `buildUnitMix`, `shouldRenderComplexInfo`
- Produces: `<DetailSidebar property={...} showComplex={boolean} />`

- [ ] **Step 1: 사이드바를 조건부로 만든다**

`detail-sidebar.tsx`:

```tsx
const ANCHORS = [
  { href: '#summary', label: '핵심 요약' },
  { href: '#transactions', label: '최근 실거래' },
  { href: '#chart', label: '가격 그래프' },
  { href: '#area', label: '면적별 비교' },
  { href: '#complex', label: '단지 정보', needsComplex: true },
  { href: '#nearby', label: '주변 단지 비교' },
  { href: '#poi', label: '주변 생활 인프라' },
];

export function DetailSidebar({
  property,
  showComplex = false,
}: {
  property: Property;
  showComplex?: boolean;
}) {
```

`ANCHORS.map` 앞에 필터를 건다:

```tsx
          {ANCHORS.filter((a) => !a.needsComplex || showComplex).map((a) => (
```

- [ ] **Step 2: 아파트 페이지를 배선한다**

`app/(public)/apt/[id]/page.tsx` — import 추가:

```tsx
import { ComplexInfoSection } from './_components/complex-info-section';
import { buildUnitMix, shouldRenderComplexInfo } from '@/lib/insights/apt-complex';
```

`loadAptInsight` 구조분해에 `complexFacts`를 더하고 파생값을 만든다(본문 렌더 직전):

```tsx
  const { narrative, dateModified, complexFacts } = await loadAptInsight(propId);
  // 렌더 시점 기준. ISR 캐시에 박제되므로 연 단위만 쓴다(apt-complex.ts 참조).
  const now = new Date();
  const unitMix = complexFacts ? buildUnitMix(complexFacts) : null;
  const showComplex = shouldRenderComplexInfo(complexFacts, now);
```

`AreaComparison`에 prop을 넘기고, 그 **다음 줄**에 새 섹션을 넣는다:

```tsx
          <AreaComparison id="area" areas={areaSummary} unitMix={unitMix} />
          <ComplexInfoSection id="complex" facts={complexFacts} now={now} />
```

`DetailSidebar`에 플래그를 넘긴다:

```tsx
          <DetailSidebar property={property} showComplex={showComplex} />
```

- [ ] **Step 3: villa·officetel도 같은 배선을 한다**

두 페이지는 같은 컴포넌트를 상대경로로 공용한다. 매칭 대상이 아니어서 `complexFacts`는 항상 `null`이고 섹션은 렌더되지 않지만, **배선은 동일하게 넣어 두 페이지가 갈리지 않게 한다.** import 경로만 다르다:

```tsx
import { ComplexInfoSection } from '../../apt/[id]/_components/complex-info-section';
```

기존 `AreaComparison`·`DetailSidebar` import가 이미 그 경로 형식을 쓰고 있으므로 같은 형식을 따른다.

- [ ] **Step 4: 타입체크·린트·빌드**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과

- [ ] **Step 5: e2e 확인**

Run: `pnpm exec dotenv -e .env.test -- playwright test tests/e2e/apt-detail.spec.ts`
Expected: PASS. `apt-detail.spec.ts`는 `#poi`·`#chart`·`최근 실거래 내역`만 보고 `#area`를 건드리지 않는 것을 확인했으므로 깨지지 않아야 한다. 깨지면 로컬 시드를 먼저 확인한다(`pnpm seed:e2e`).

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/apt/[id]/page.tsx" "app/(public)/villa/[id]/page.tsx" "app/(public)/officetel/[id]/page.tsx" "app/(public)/apt/[id]/_components/detail-sidebar.tsx"
git commit -m "feat(apt-complex): 상세 페이지·사이드바 배선

사이드바 네비와 본문이 갈리지 않도록 shouldRenderComplexInfo 하나로 판정한다.
항목만 남고 앵커가 없으면 클릭해도 아무 데도 안 간다.

villa·officetel은 complexFacts가 항상 null이라 섹션이 안 뜨지만 배선은
동일하게 넣어 세 페이지가 갈리지 않게 한다."
```

---

## Task 7: 운영 확인

코드가 아니라 **확인 절차**다. 머지·배포 후에 한다.

- [ ] **Step 1: 매칭된 단지에서 섹션이 뜨는지**

운영 읽기전용 터널로 매칭된 `propertyId` 하나를 찾아 그 URL을 연다.

```sql
SELECT "propertyId", "kaptName" FROM "AptComplex"
WHERE "propertyId" IS NOT NULL AND households IS NOT NULL AND "parkingUnder" IS NOT NULL
LIMIT 3;
```

확인할 것: 「단지 정보」 섹션이 뜨는가 · 사이드바에 `단지 정보` 항목이 있는가 · 「면적별 실거래 비교」에 구성 줄이 있는가 · 「한눈에 보기」 맨 뒤에 단지 문장이 붙었는가.

- [ ] **Step 2: 미매칭 단지에서 아무것도 안 뜨는지**

```sql
SELECT id FROM "Property" p WHERE "propertyType"='APARTMENT' AND "redirectToId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "AptComplex" c WHERE c."propertyId" = p.id) LIMIT 3;
```

**빈 카드나 "정보 없음" 문구가 새어나오면 그게 곧 얇은 콘텐츠다.** 사이드바에 `단지 정보` 항목이 남아 있는지도 본다 — 남아 있으면 Step 1의 조건 공유가 안 된 것이다.

- [ ] **Step 3: 색인 무변화 확인**

```bash
SAMPLE_SIZE=2500 pnpm exec dotenv -e .env.prod.local -- tsx scripts/ops/measure-narrative-index.ts
```

`(2) 현재 색인 대상` 비율이 배포 전(86.8~87.0%)과 같아야 한다. 무작위 표본이라 수십 건 변동은 정상이고, **수백 건 단위 증가만 문제 신호**다. 늘었다면 단지 모듈이 `fired`에 새어 들어간 것이므로 Task 3의 계약 테스트부터 다시 본다.

- [ ] **Step 4: 정리**

터널 종료 + `.env.prod.local` 삭제. 결과를 스펙 문서 하단에 실측 기록으로 추가한다.

---

## 다음 스펙 — 색인 화이트리스트 전환

이 계획은 `lib/seo/indexable.ts`를 건드리지 않는다. 전환하면 실측상 아파트 색인 페이지의 **55%(약 21,000)** 가 빠진다.

```ts
const INDEX_SIGNAL_KEYS = ['trend', 'peer', 'floor', 'flags'];
isNarrativeIndexable(n, 3) → n.fired.filter(k => INDEX_SIGNAL_KEYS.includes(k)).length >= 3
```

AdSense 관점에서 분모를 줄이는 방향이라 유리하지만 규모가 커서 별도 판단이 필요하다.
