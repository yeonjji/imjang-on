# 아파트 「한눈에 보기」 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트 상세의 「한눈에 보기」를 문장 박스에서 헤더 문장 + 배지 + 타일 + 카드 대시보드로 바꾼다. 문장 생성은 건드리지 않는다.

**Architecture:** 각 산문 모듈이 문장을 만들기 **전에 이미 계산해 둔 값**을 구조화해 `display`로 함께 내보낸다. `text`·`fired`·`sentences`는 그대로 둔다 — 메타 설명과 색인 판정이 그걸 쓰기 때문이다. 화면은 `display`만 읽고, 값을 재계산하거나 파싱하지 않는다. 기존 `InsightSection`은 나머지 6종이 계속 쓰므로 손대지 않고, 아파트 전용 컴포넌트를 새로 만든다.

**Tech Stack:** Next.js 15 App Router · TypeScript · vitest(`environment: 'node'`) · `renderToStaticMarkup` SSR 계약 테스트 · Tailwind CSS 변수

## Global Constraints

- **`narrative.fired`의 구성을 바꾸지 않는다.** `display` 추가가 `fired`에 영향을 주면 안 된다. `fired.length >= 3`이 색인 여부를 결정한다.
- **`narrative.text`를 바꾸지 않는다.** 앞 150자가 메타 설명이다.
- **`narrative.sentences`의 내용과 순서를 바꾸지 않는다.**
- `lib/seo/indexable.ts`를 수정하지 않는다.
- **`components/ui/insight-section.tsx`를 수정하지 않는다.** 빌라·오피스텔·어린이집·병원·학교·도시생활 6종이 쓴다.
- `lib/insights/apt-complex.ts`·`lib/property.ts`·`lib/insights/apt-loader.ts`·`getPropertyById`를 수정하지 않는다.
- **`unitMixInsight`·`parkingInsight`는 `display`를 내지 않는다.** 같은 값이 아래 「단지 정보」 섹션과 「면적별 실거래 비교」에 이미 있다.
- **값·단위는 모듈이 완성한 문자열로 넣는다.** 화면에서 파싱·재계산 금지.
- 결측은 렌더하지 않는다. 빈 타일·`정보 없음`·`—` 금지.
- 상승 빨강 · 하락 파랑(한국 관례). 색에만 의존하지 않도록 부호를 함께 표기(WCAG 2.1 AA).
- 그림자는 `--shadow-soft` 하나. 한글 본문 14px 이상.
- 스펙: `docs/superpowers/specs/2026-09-14-apt-insight-dashboard-design.md`

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/insights/shared.ts` | **수정.** `DisplayUnit` 타입 정의, `Insight`·`Narrative`에 선택 필드 추가 |
| `lib/insights/apt.ts` | **수정.** 각 모듈이 `display` 동반 생성, 조립부가 수집 + 배지 계산 |
| `app/(public)/apt/[id]/_components/insight-dashboard.tsx` | **신규.** 아파트 전용 대시보드 렌더 |
| `app/(public)/apt/[id]/page.tsx` | **수정.** `InsightSection` → `InsightDashboard` 교체 |
| `tests/lib/apt-insight-display.test.ts` | **신규.** 모듈별 `display` 값 단언 |
| `tests/lib/apt-insight-contract.test.ts` | **신규.** `fired`·`text`·`sentences` 불변 회귀 |
| `tests/components/insight-dashboard.test.tsx` | **신규.** SSR 계약 |

---

## Task 1: DisplayUnit 타입과 모듈별 표시 단위

**Files:**
- Modify: `lib/insights/shared.ts`
- Modify: `lib/insights/apt.ts`
- Test: `tests/lib/apt-insight-display.test.ts`

**Interfaces:**
- Produces: `DisplayUnit` 타입, `Insight.display?: DisplayUnit[]`, `Narrative.display?: DisplayUnit[]`, `Narrative.badges?: string[]`

- [ ] **Step 1: `shared.ts`에 타입을 추가한다**

`lib/insights/shared.ts`의 기존 두 인터페이스를 아래로 교체한다. **필드 추가만 하고 기존 필드는 건드리지 않는다.**

```ts
/**
 * 화면 표시 단위. 모듈이 문장을 만들기 전에 가진 값을 그대로 구조화해 넘긴다.
 * value·sub는 **모듈이 완성한 문자열**이다 — 화면은 파싱하거나 재계산하지 않는다.
 * shape이 판별자다. 'card'를 두 번 쓰면 TS가 구분하지 못하므로 칩 카드는 'chips'로 나눈다.
 */
export type DisplayUnit =
  | { shape: 'tile'; key: string; label: string; value: string; sub?: string; tone?: 'up' | 'down' }
  | { shape: 'chips'; key: string; label: string; chips: { label: string; value: string }[] }
  | { shape: 'card'; key: string; label: string; value: string; sub?: string }
  | { shape: 'alert'; key: string; label: string; value: string; sub?: string };

export interface Insight {
  key: string;
  text: string;
  /** 화면 전용. 없으면 그 모듈은 대시보드에 표시되지 않는다(문장으로만 남는다). */
  display?: DisplayUnit[];
}

export interface Narrative {
  sentences: string[];
  text: string;
  fired: string[];
  /** 발화 모듈의 display를 순서대로 이어 붙인 것. fired와 무관하다. */
  display?: DisplayUnit[];
  badges?: string[];
}
```

`shared.ts`의 `accessInsight`·`priceContextInsight`·`assembleNarrative`는 **수정하지 않는다.** `display`가 선택 필드라 나머지 6종은 영향받지 않는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/lib/apt-insight-display.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';
import type { DisplayUnit } from '@/lib/insights/shared';

const BASE: AptInsightInput = {
  name: '헬리오시티',
  sigunguName: '송파구',
  builtYear: 2018,
  households: 9510,
  saleDeals: [
    { contractDate: '2026-01-10', amountManwon: 250000 },
    { contractDate: '2026-08-20', amountManwon: 290000 },
  ],
  saleTrend: { changePct: 17.4, pyeong: 26, sampleCount: 93 },
  regionAvgSaleManwon: 134000,
  regionSampleCount: 120,
  nearestStation: { name: '송파', lines: ['8호선'], distanceMeters: 480 },
  infra: [
    { label: '편의·마트', count: 1, capped: false },
    { label: '카페', count: 7, capped: false },
    { label: '병원', count: 12, capped: true },
  ],
};

const units = (d: AptInsightInput): DisplayUnit[] => buildAptNarrative(d)?.display ?? [];
const byKey = (d: AptInsightInput, key: string) => units(d).find((u) => u.key === key);

describe('가격 수준 타일', () => {
  it('최근 실거래가와 시군구 평균을 각각 제 자리에 넣는다', () => {
    expect(byKey(BASE, 'peer')).toEqual({
      shape: 'tile', key: 'peer', label: '가격 수준', value: '29억', sub: '송파구 평균 13.4억',
    });
  });
});

describe('가격 흐름 타일', () => {
  it('상승은 + 부호와 tone up', () => {
    expect(byKey(BASE, 'trend')).toEqual({
      shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17%',
      sub: '직전 12개월 대비 · 표본 93건', tone: 'up',
    });
  });

  it('하락은 − 부호와 tone down', () => {
    const d = { ...BASE, saleTrend: { changePct: -3.2, pyeong: 26, sampleCount: 20 } };
    expect(byKey(d, 'trend')).toMatchObject({ value: '−3%', tone: 'down' });
  });

  it('보합은 부호 없이 표기하고 tone이 없다', () => {
    const d = { ...BASE, saleTrend: { changePct: 1, pyeong: 26, sampleCount: 20 } };
    const u = byKey(d, 'trend');
    expect(u).toMatchObject({ value: '보합' });
    expect(u && 'tone' in u ? u.tone : undefined).toBeUndefined();
  });

  // 같은 평형 표본이 부족해 방향을 못 세우면 문장은 최근가만 말한다.
  // 그 값은 이미 '가격 수준' 타일에 있으므로 타일을 또 만들지 않는다.
  it('saleTrend가 없으면 타일을 내지 않는다', () => {
    expect(byKey({ ...BASE, saleTrend: null }, 'trend')).toBeUndefined();
  });
});

describe('입지 타일과 생활 편의 칩', () => {
  it('역은 타일로, 인프라는 칩으로 나뉜다', () => {
    expect(byKey(BASE, 'access')).toEqual({
      shape: 'tile', key: 'access', label: '입지', value: '도보 6분', sub: '8호선 송파',
    });
    expect(byKey(BASE, 'infra')).toEqual({
      shape: 'chips', key: 'infra', label: '생활 편의',
      chips: [
        { label: '편의·마트', value: '1' },
        { label: '카페', value: '7' },
        { label: '병원', value: '12+' },
      ],
    });
  });

  it('역이 없으면 타일만 빠지고 칩은 남는다', () => {
    const d = { ...BASE, nearestStation: null };
    expect(byKey(d, 'access')).toBeUndefined();
    expect(byKey(d, 'infra')).toBeDefined();
  });

  it('인프라가 2종 미만이면 칩이 없다', () => {
    const d = { ...BASE, infra: [{ label: '카페', count: 3, capped: false }] };
    expect(byKey(d, 'infra')).toBeUndefined();
    expect(byKey(d, 'access')).toBeDefined();
  });
});

describe('층별 시세 카드', () => {
  it('양의 기울기는 + 부호', () => {
    const d = { ...BASE, floorPremium: { pyeong: 26, pctPerFloor: 1.2, r2: 0.35, n: 77 } };
    expect(byKey(d, 'floor')).toEqual({
      shape: 'card', key: 'floor', label: '층별 시세', value: '한 층당 +1%',
      sub: '최근 매매 77건 · 설명력 R² 0.35',
    });
  });

  it('음의 기울기는 − 부호', () => {
    const d = { ...BASE, floorPremium: { pyeong: 26, pctPerFloor: -0.8, r2: 0.2, n: 30 } };
    expect(byKey(d, 'floor')).toMatchObject({ value: '한 층당 −0.8%' });
  });
});

describe('거래 특이사항 주의 박스', () => {
  it('두 항목이 다 있으면 이어 붙인다', () => {
    const d = { ...BASE, flags: { cancelledCount12m: 1, anomalyCount12m: 13, topAnomaly: null } };
    expect(byKey(d, 'flags')).toEqual({
      shape: 'alert', key: 'flags', label: '거래 특이사항',
      value: '해제 신고 1건 · ±10% 이탈 13건', sub: '최근 1년',
    });
  });

  it('이상거래만 있으면 그것만 적는다', () => {
    const d = { ...BASE, flags: { cancelledCount12m: 0, anomalyCount12m: 4, topAnomaly: null } };
    expect(byKey(d, 'flags')).toMatchObject({ value: '±10% 이탈 4건' });
  });
});

describe('표시 단위를 내지 않는 모듈', () => {
  it('규모·연식은 헤더 문장이 담당하므로 display가 없다', () => {
    expect(byKey(BASE, 'scale')).toBeUndefined();
  });

  it('면적 구성과 주차는 아래 섹션이 담당하므로 display가 없다', () => {
    const d: AptInsightInput = {
      ...BASE,
      unitMix: {
        bands: [
          { label: '60㎡ 이하', units: 2854, pct: 30 },
          { label: '60~85㎡', units: 5132, pct: 54 },
          { label: '85~135㎡', units: 1500, pct: 16 },
          { label: '135㎡ 초과', units: 24, pct: 0 },
        ],
        smallMidPct: 84,
        dominant: { label: '60~85㎡', pct: 54 },
      },
      density: {
        parkingPerHousehold: 1.27, parkingAllUnderground: true,
        evPer100: 2.7, householdsPerElevator: 25, cctvPer100: 28,
      },
    };
    expect(byKey(d, 'unitMix')).toBeUndefined();
    expect(byKey(d, 'parking')).toBeUndefined();
  });
});

describe('배지', () => {
  it('도보 15분 이내면 역세권', () => {
    expect(buildAptNarrative(BASE)?.badges).toContain('역세권');
  });

  it('도보 16분이면 역세권이 아니다', () => {
    const d = { ...BASE, nearestStation: { name: '송파', lines: ['8호선'], distanceMeters: 1300 } };
    expect(buildAptNarrative(d)?.badges ?? []).not.toContain('역세권');
  });

  it('1,000세대 이상이면 대단지', () => {
    expect(buildAptNarrative(BASE)?.badges).toContain('대단지');
    expect(buildAptNarrative({ ...BASE, households: 999 })?.badges ?? []).not.toContain('대단지');
  });

  it('세대수를 모르면 대단지 배지가 없다', () => {
    expect(buildAptNarrative({ ...BASE, households: null })?.badges ?? []).not.toContain('대단지');
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-insight-display.test.ts`
Expected: FAIL — `display`·`badges`가 `undefined`

- [ ] **Step 4: 모듈에 display를 붙인다**

`lib/insights/apt.ts`. 각 모듈의 `return` 문에 `display`를 더한다. **`text` 문자열은 한 글자도 바꾸지 않는다.**

`tTrend`의 `if (t) { ... }` 블록의 return을 교체한다:

```ts
    const pct = Math.round(t.changePct);
    const body = pct >= 3 ? `약 ${pct}% 높습니다`
      : pct <= -3 ? `약 ${Math.abs(pct)}% 낮습니다`
      : '큰 차이가 없습니다';
    // 화면 값: 부호를 붙여 색에만 의존하지 않게 한다(U+2212 빼기 기호 — 하이픈이 아니다).
    const tileValue = pct >= 3 ? `+${pct}%` : pct <= -3 ? `−${Math.abs(pct)}%` : '보합';
    const tone = pct >= 3 ? ('up' as const) : pct <= -3 ? ('down' as const) : undefined;
    return { key: 'trend',
      text: `${t.pyeong}평 최근 12개월 평균 실거래가는 직전 12개월 평균보다 ${body}(표본 ${t.sampleCount}건, 최근 실거래 ${formatBillion(last)}).`,
      display: [{
        shape: 'tile', key: 'trend', label: '가격 흐름', value: tileValue,
        sub: `직전 12개월 대비 · 표본 ${t.sampleCount}건`,
        ...(tone ? { tone } : {}),
      }] };
```

같은 함수의 마지막 fallback return은 **display 없이 그대로 둔다**:

```ts
  // 같은 평형 표본이 부족하면 방향 단정 없이 최근가만.
  // 이 값은 '가격 수준' 타일이 이미 보여주므로 타일을 또 만들지 않는다.
  return { key: 'trend', text: `최근 실거래가는 ${formatBillion(last)}입니다.` };
```

`pPeer`의 return을 교체한다:

```ts
  return { key: 'peer',
    text: `최근 실거래 ${josa(formatBillion(latest), '은', '는')} ${judge}입니다(${d.sigunguName} 평균 ${formatBillion(avg)}).`,
    display: [{
      shape: 'tile', key: 'peer', label: '가격 수준',
      value: formatBillion(latest),
      sub: `${d.sigunguName} 평균 ${formatBillion(avg)}`,
    }] };
```

`aAccess`의 마지막 return을 교체한다(그 위의 `text` 조립부는 그대로):

```ts
  const display: DisplayUnit[] = [];
  if (station) {
    display.push({
      shape: 'tile', key: 'access', label: '입지',
      value: `도보 ${walkMin}분`,
      sub: `${line}${station.name}`.trim(),
    });
  }
  if (hasInfra) {
    display.push({
      shape: 'chips', key: 'infra', label: '생활 편의',
      chips: d.infra
        .filter((c) => c.count > 0)
        .map((c) => ({ label: c.label, value: `${c.count}${c.capped ? '+' : ''}` })),
    });
  }
  return { key: 'access', text, display };
```

`floorPremiumInsight`의 return을 교체한다:

```ts
  const signed = fp.pctPerFloor > 0 ? `+${pct}` : `−${pct}`;
  return { key: 'floor', text,
    display: [{
      shape: 'card', key: 'floor', label: '층별 시세',
      value: `한 층당 ${signed}%`,
      sub: `최근 매매 ${fp.n}건 · 설명력 R² ${r2}`,
    }] };
```

`flagsInsight`의 return을 교체한다. **문장용 `items`와 화면용 `short`를 따로 만든다** — 문장은 서술형이고 타일은 짧아야 한다:

```ts
  const short: string[] = [];
  if (f.cancelledCount12m > 0) short.push(`해제 신고 ${f.cancelledCount12m}건`);
  if (f.anomalyCount12m > 0) short.push(`±10% 이탈 ${f.anomalyCount12m}건`);
  return { key: 'flags', text: `최근 1년 거래에는 ${items.join('과 ')}이 집계됩니다.`,
    display: [{
      shape: 'alert', key: 'flags', label: '거래 특이사항',
      value: short.join(' · '), sub: '최근 1년',
    }] };
```

`bScale`·`unitMixInsight`·`parkingInsight`는 **수정하지 않는다.** `display`가 없으므로 대시보드에 나타나지 않는다.

파일 상단 import에 타입을 더한다:

```ts
import type { DisplayUnit, Insight, Narrative } from './shared';
```

- [ ] **Step 5: 조립부에서 display와 badges를 만든다**

`buildAptNarrative`의 마지막 `return`을 교체한다. **`mods`·`all`·`sentences`·`fired` 계산은 그대로 둔다.**

```ts
  const sentences = all.map((m, i) => (i === 0 ? `${josa(d.name, '은', '는')} ${m.text}` : m.text));
  // 화면 전용. fired에 영향을 주지 않는다 — 색인 계약(스펙 §3).
  const display = all.flatMap((m) => m.display ?? []);
  const badges: string[] = [];
  if (d.nearestStation && walkMinutes(d.nearestStation.distanceMeters) <= 15) badges.push('역세권');
  if (d.unitMix && d.unitMix.smallMidPct >= 80) badges.push('중소형 중심');
  if (d.households != null && d.households >= 1000) badges.push('대단지');
  return { sentences, text: sentences.join(' '), fired: mods.map((m) => m.key), display, badges };
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-insight-display.test.ts`
Expected: PASS

- [ ] **Step 7: 전체 테스트·타입·린트**

Run: `pnpm typecheck && pnpm lint && pnpm exec dotenv -e .env.test -- vitest run tests/lib tests/components`
Expected: 전부 통과. `hub-summary-amenity`·`merge-duplicate-properties`는 `tests/integration/`이라 이 범위 밖이다.

- [ ] **Step 8: 커밋**

```bash
git add lib/insights/shared.ts lib/insights/apt.ts tests/lib/apt-insight-display.test.ts
git commit -m "feat(apt-insight): 모듈이 표시 단위를 동반 생성

문장을 만들기 전에 이미 가진 값을 구조화해 display로 함께 내보낸다.
text·fired·sentences는 건드리지 않는다 — 메타 설명과 색인 판정이 쓴다.

값·단위는 모듈이 완성한 문자열로 넣는다. 화면이 재계산하면
'최근 실거래 29억'을 '29건'으로 옮겨 적는 류의 오독이 배포된다."
```

---

## Task 2: 계약 회귀 테스트

**Files:**
- Test: `tests/lib/apt-insight-contract.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Narrative.display`·`Narrative.badges`

이 태스크는 코드를 바꾸지 않는다. **Task 1이 계약을 깨지 않았음을 고정**하는 것이 목적이다. 이 가드가 없으면 나중에 누가 `fired`에 단지 모듈을 넣어도 아무도 모른다.

- [ ] **Step 1: 테스트를 쓴다**

`tests/lib/apt-insight-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';

const BASE: AptInsightInput = {
  name: '헬리오시티',
  sigunguName: '송파구',
  builtYear: 2018,
  households: 9510,
  saleDeals: [
    { contractDate: '2026-01-10', amountManwon: 250000 },
    { contractDate: '2026-08-20', amountManwon: 290000 },
  ],
  saleTrend: { changePct: 17.4, pyeong: 26, sampleCount: 93 },
  regionAvgSaleManwon: 134000,
  regionSampleCount: 120,
  nearestStation: { name: '송파', lines: ['8호선'], distanceMeters: 480 },
  infra: [
    { label: '편의·마트', count: 1, capped: false },
    { label: '카페', count: 7, capped: false },
    { label: '병원', count: 12, capped: true },
  ],
  floorPremium: { pyeong: 26, pctPerFloor: 1.2, r2: 0.35, n: 77 },
  flags: { cancelledCount12m: 1, anomalyCount12m: 13, topAnomaly: null },
};

describe('색인 계약', () => {
  it('fired는 core와 extra 키만 담는다', () => {
    expect(buildAptNarrative(BASE)?.fired).toEqual(['scale', 'trend', 'peer', 'access', 'floor', 'flags']);
  });

  it('단지정보를 넣어도 fired가 변하지 않는다', () => {
    const withComplex: AptInsightInput = {
      ...BASE,
      unitMix: {
        bands: [
          { label: '60㎡ 이하', units: 2854, pct: 30 },
          { label: '60~85㎡', units: 5132, pct: 54 },
          { label: '85~135㎡', units: 1500, pct: 16 },
          { label: '135㎡ 초과', units: 24, pct: 0 },
        ],
        smallMidPct: 84,
        dominant: { label: '60~85㎡', pct: 54 },
      },
      density: {
        parkingPerHousehold: 1.27, parkingAllUnderground: true,
        evPer100: 2.7, householdsPerElevator: 25, cctvPer100: 28,
      },
    };
    expect(buildAptNarrative(withComplex)!.fired).toEqual(buildAptNarrative(BASE)!.fired);
  });

  it('display가 fired 길이를 바꾸지 않는다 — 색인 판정은 fired만 센다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.fired.length).toBe(6);
    expect(n.display!.length).toBeGreaterThan(0);
  });
});

describe('메타 설명 계약', () => {
  it('text는 sentences를 공백으로 이은 것이다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.text).toBe(n.sentences.join(' '));
  });

  it('앞 150자가 규모·연식 문장으로 시작한다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.text.slice(0, 150)).toMatch(/^헬리오시티는 2018년 준공 · 9,510세대 단지입니다\./);
  });

  it('문장 개수와 순서가 유지된다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.sentences).toHaveLength(6);
    expect(n.sentences[0]).toContain('준공');
    expect(n.sentences[n.sentences.length - 1]).toContain('집계됩니다');
  });
});

describe('게이트', () => {
  it('core가 3개 미만이면 narrative 자체가 null이다', () => {
    expect(buildAptNarrative({
      ...BASE, saleDeals: [], saleTrend: null, regionAvgSaleManwon: null,
      nearestStation: null, infra: [], floorPremium: null, flags: null,
    })).toBeNull();
  });
});
```

- [ ] **Step 2: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/apt-insight-contract.test.ts`
Expected: PASS. 실패하면 Task 1이 계약을 깬 것이므로 **Task 3으로 넘어가지 말고 Task 1을 고친다.**

- [ ] **Step 3: 커밋**

```bash
git add tests/lib/apt-insight-contract.test.ts
git commit -m "test(apt-insight): 색인·메타 설명 계약 회귀 가드

fired 구성, text = sentences.join, 앞 150자 시작 문장, 문장 개수를 고정한다.
이 가드가 없으면 나중에 fired에 모듈이 새어 들어가도 아무도 모른다."
```

---

## Task 3: 대시보드 컴포넌트

**Files:**
- Create: `app/(public)/apt/[id]/_components/insight-dashboard.tsx`
- Test: `tests/components/insight-dashboard.test.tsx`

**Interfaces:**
- Consumes: `Narrative`(`sentences`·`display`·`badges`), `DisplayUnit`
- Produces: `<InsightDashboard narrative={AptNarrative} />`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/components/insight-dashboard.test.tsx`:

```tsx
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { InsightDashboard } from '@/app/(public)/apt/[id]/_components/insight-dashboard';
import type { Narrative } from '@/lib/insights/shared';

// 이 저장소의 vitest는 esbuild classic JSX 변환을 쓴다. JSX를 쓰려면 React가 전역에 있어야 한다
// (tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

const FULL: Narrative = {
  sentences: ['헬리오시티는 2018년 준공 · 9,510세대 단지입니다.', '두 번째 문장.'],
  text: '헬리오시티는 2018년 준공 · 9,510세대 단지입니다. 두 번째 문장.',
  fired: ['scale', 'trend'],
  badges: ['역세권', '중소형 중심'],
  display: [
    { shape: 'tile', key: 'peer', label: '가격 수준', value: '29억', sub: '송파구 평균 13.4억' },
    { shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17%', sub: '직전 12개월 대비 · 표본 93건', tone: 'up' },
    { shape: 'tile', key: 'access', label: '입지', value: '도보 6분', sub: '8호선 송파' },
    { shape: 'chips', key: 'infra', label: '생활 편의', chips: [{ label: '카페', value: '7' }, { label: '병원', value: '12+' }] },
    { shape: 'card', key: 'floor', label: '층별 시세', value: '한 층당 +1%', sub: '최근 매매 77건 · 설명력 R² 0.35' },
    { shape: 'alert', key: 'flags', label: '거래 특이사항', value: '±10% 이탈 13건', sub: '최근 1년' },
  ],
};

const html = (n: Narrative) => renderToStaticMarkup(<InsightDashboard narrative={n} />);

describe('InsightDashboard', () => {
  it('헤더는 첫 문장이다', () => {
    expect(html(FULL)).toContain('헬리오시티는 2018년 준공 · 9,510세대 단지입니다.');
  });

  it('배지를 렌더한다', () => {
    const out = html(FULL);
    expect(out).toContain('역세권');
    expect(out).toContain('중소형 중심');
  });

  it('타일·칩·카드·주의 박스를 모두 렌더한다', () => {
    const out = html(FULL);
    for (const s of ['가격 수준', '29억', '가격 흐름', '+17%', '입지', '도보 6분',
                     '생활 편의', '카페', '12+', '층별 시세', '한 층당 +1%',
                     '거래 특이사항', '±10% 이탈 13건']) {
      expect(out).toContain(s);
    }
  });

  it('sentences가 비면 아무것도 렌더하지 않는다', () => {
    expect(html({ sentences: [], text: '', fired: [] })).toBe('');
  });

  it('display가 없어도 헤더 문장은 남는다', () => {
    const out = html({ sentences: ['삼익은 1994년 준공 단지입니다.'], text: '삼익은 1994년 준공 단지입니다.', fired: ['scale'] });
    expect(out).toContain('삼익은 1994년 준공 단지입니다.');
  });

  it('배지가 없으면 배지 줄이 없다', () => {
    const out = html({ ...FULL, badges: [] });
    expect(out).not.toContain('역세권');
  });

  it('타일이 없으면 타일 행이 없다 — 빈 칸을 두지 않는다', () => {
    const out = html({ ...FULL, display: FULL.display!.filter((u) => u.shape !== 'tile') });
    expect(out).not.toContain('가격 수준');
    expect(out).toContain('생활 편의');
  });

  it('보조 줄이 없는 타일은 보조 줄을 아예 빼고 — 를 찍지 않는다', () => {
    const out = html({ ...FULL, display: [{ shape: 'tile', key: 'peer', label: '가격 수준', value: '4.42억' }] });
    expect(out).toContain('4.42억');
    expect(out).not.toContain('—');
  });

  it('하락은 파랑, 상승은 빨강 (한국 관례)', () => {
    const up = html({ ...FULL, display: [{ shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17%', tone: 'up' }] });
    const down = html({ ...FULL, display: [{ shape: 'tile', key: 'trend', label: '가격 흐름', value: '−3%', tone: 'down' }] });
    expect(up).toContain('--color-red');
    expect(down).toContain('--color-blue');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/insight-dashboard.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트를 만든다**

착수 전 `DESIGN.md`를 읽고 인접 컴포넌트(`app/(public)/apt/[id]/_components/`)의 클래스 관례를 확인한다.

`app/(public)/apt/[id]/_components/insight-dashboard.tsx`:

```tsx
import type { DisplayUnit, Narrative } from '@/lib/insights/shared';

/**
 * 아파트 전용 「한눈에 보기」 대시보드.
 * 값은 모듈이 완성해 넘긴 문자열을 그대로 쓴다 — 여기서 파싱하거나 재계산하지 않는다.
 * 나머지 6종(빌라·오피스텔·어린이집·병원·학교·도시생활)은 components/ui/insight-section.tsx를
 * 계속 쓴다. 그 파일은 건드리지 않는다.
 */
export function InsightDashboard({ narrative }: { narrative: Narrative }) {
  const { sentences, display = [], badges = [] } = narrative;
  if (sentences.length === 0) return null;

  const tiles = display.filter((u): u is Extract<DisplayUnit, { shape: 'tile' }> => u.shape === 'tile');
  const blocks = display.filter((u) => u.shape === 'chips' || u.shape === 'card');
  const alerts = display.filter((u): u is Extract<DisplayUnit, { shape: 'alert' }> => u.shape === 'alert');

  return (
    <section
      aria-label="한눈에 보기"
      className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 sm:p-6"
    >
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">한눈에 보기</h2>

      <p className="break-keep text-[15px] leading-relaxed text-[var(--color-text)]">{sentences[0]}</p>

      {badges.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <li
              key={b}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1 text-xs font-bold text-[var(--color-blue-dark)]"
            >
              {b}
            </li>
          ))}
        </ul>
      )}

      {tiles.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-row">
          {tiles.map((t) => (
            <div
              key={t.key}
              className="flex-1 rounded-[var(--radius-card)] bg-[var(--color-card)] p-4"
            >
              <p className="text-xs text-[var(--color-muted)]">{t.label}</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  t.tone === 'up'
                    ? 'text-[var(--color-red)]'
                    : t.tone === 'down'
                      ? 'text-[var(--color-blue)]'
                      : 'text-[var(--color-blue-dark)]'
                }`}
              >
                {t.value}
              </p>
              {t.sub && <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">{t.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {blocks.map((b) => (
            <div key={b.key} className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-4">
              <p className="text-xs font-bold text-[var(--color-blue-dark)]">{b.label}</p>
              {b.shape === 'chips' ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {b.chips.map((c) => (
                    <li
                      key={c.label}
                      className="rounded-full bg-[var(--color-soft)] px-3 py-1 text-sm text-[var(--color-text)]"
                    >
                      {c.label} {c.value}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="mt-1 text-[17px] font-bold text-[var(--color-blue-dark)]">{b.value}</p>
                  {b.sub && <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">{b.sub}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {alerts.map((a) => (
        <div
          key={a.key}
          className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)] p-4"
        >
          <p className="text-xs font-bold text-[var(--color-blue-dark)]">{a.label}</p>
          <p className="mt-1 break-keep text-sm text-[var(--color-text)]">{a.value}</p>
          {a.sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{a.sub}</p>}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/insight-dashboard.test.tsx`
Expected: PASS (10개)

CSS 변수는 `app/globals.css`에 `--radius-card`와 `--shadow-soft`만 있다. 알약 모양은 인접 컴포넌트 관례대로 `rounded-full`을 쓴다(그 디렉터리에서 18회 사용). 새 변수를 정의하지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/insight-dashboard.tsx" tests/components/insight-dashboard.test.tsx
git commit -m "feat(apt-insight): 아파트 전용 대시보드 컴포넌트

헤더 문장 + 배지 + 타일 + 카드 + 주의 박스. 값은 모듈이 넘긴 문자열을
그대로 쓰고 여기서 계산하지 않는다.

타일 폭은 균등 분배다 — 2칸이면 절반씩, 3칸이면 3등분. 고정 4열이면
3칸일 때 오른쪽이 빈다. 결측은 렌더하지 않는다."
```

---

## Task 4: 페이지 배선

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `<InsightDashboard narrative={...} />`

- [ ] **Step 1: import를 바꾼다**

`app/(public)/apt/[id]/page.tsx:37`의 다음 줄을 제거한다:

```tsx
import { InsightSection } from '@/components/ui/insight-section';
```

대신 상대경로 import를 더한다(인접 섹션들과 같은 형식):

```tsx
import { InsightDashboard } from './_components/insight-dashboard';
```

- [ ] **Step 2: 렌더 지점을 바꾼다**

`app/(public)/apt/[id]/page.tsx:172`를 교체한다:

```tsx
      {narrative && <InsightDashboard narrative={narrative} />}
```

**`narrative.text`를 쓰는 `generateMetadata`와 `isNarrativeIndexable` 호출부는 건드리지 않는다.**

- [ ] **Step 3: 다른 6종이 그대로인지 확인한다**

Run: `grep -rn "InsightSection" app/`
Expected: `villa`·`officetel`·`childcare`·`medical/hospital`·`school`·`urban` 여섯 페이지만 남고 `apt`는 없다.

- [ ] **Step 4: 타입체크·린트·빌드**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과.

**주의:** 로컬 `.env.local`·`.env.test`는 비어 있는 로컬 docker DB(5433)를 가리킨다. 빌드가 성공해도 내용이 없는 게 정상이므로 "빌드 통과 = 화면 정상"이 아니다. 빌드는 타입·번들 오류만 잡는 용도로 본다.

- [ ] **Step 5: e2e**

Run: `pnpm seed:e2e && pnpm exec dotenv -e .env.test -- playwright test tests/e2e/apt-detail.spec.ts`
Expected: PASS. 이 스펙은 `#poi`·`#chart`·`최근 실거래 내역`만 보고 「한눈에 보기」 문구를 단언하지 않는 것을 확인했으므로 깨지지 않아야 한다. 깨지면 시드 상태부터 본다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/apt/[id]/page.tsx"
git commit -m "feat(apt-insight): 아파트 상세를 대시보드로 배선

아파트만 InsightDashboard를 쓰고 나머지 6종은 InsightSection을 그대로 쓴다.
generateMetadata와 색인 판정은 narrative.text·fired를 그대로 참조한다."
```

---

## Task 5: 운영 확인 (머지·배포 후)

코드가 아니라 확인 절차다. **머지·배포 후에 한다.**

- [ ] **Step 1: 렌더 확인**

매칭 단지와 미매칭 단지에서 각각 대시보드가 뜨는지, 빈 타일이나 `정보 없음`이 새어나오지 않는지 본다. 배포된 웹 컨테이너 안에서 조회한다(운영 도메인에 요청 버스트를 내지 않는다).

확인 항목: 헤더 문장 · 배지 · 타일 개수 · 칩 · 주의 박스 · 「단지 정보」와 「면적별 실거래 비교」에 주차·구성이 중복되지 않는지.

- [ ] **Step 2: 색인 무변화 확인**

Run: `SAMPLE_SIZE=1000 pnpm exec dotenv -e .env.prod.local -- tsx scripts/ops/measure-narrative-index.ts`
Expected: `(2) 현재 색인 대상` 비율이 **87.0%**(2026-09-14 실측)와 같아야 한다. 무작위 표본이라 수십 건 변동은 정상이고, 수백 건 단위 증가·감소만 문제 신호다.

- [ ] **Step 3: 타일 개수 분포 실측**

스펙 §5의 분포(3칸 50% · 2칸 25%)는 조합 데이터에서 **유도한 추정치**다. `saleTrend`가 없으면 가격 흐름 타일이 빠지므로 실제 분포는 이보다 낮을 수 있다. 배포 후 표본으로 실제 타일 개수 분포를 재고, 2칸이 지배적이면 타일 후보 재검토를 별도 과제로 남긴다.

- [ ] **Step 4: 결과를 스펙 문서 하단에 실측 기록으로 추가한다.**

---

## 참고

- 스펙: `docs/superpowers/specs/2026-09-14-apt-insight-dashboard-design.md`
- 기존 단지정보 작업 스펙(같은 페이지의 「단지 정보」·「면적별 실거래 비교」): `docs/superpowers/specs/2026-09-09-apt-complex-ui-design.md`
- 기존 테스트 관례: `tests/components/property-detail-hero-ssr.test.ts`(React 전역 바인딩), `tests/lib/apt-complex-narrative.test.ts:68`(`fired` 불변 단언)
