# WS4 Part A · Phase A1a — 상세페이지 FAQ 전면(동적 치환) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 색인되는 상세페이지에 **페이지 데이터로 치환된 고유 FAQ + FAQPage JSON-LD**를 붙여 "라벨-값뿐" thin 신호를 해소한다. 본 plan은 파일럿 3종(`apt` · `hospital` · `subscription`)까지.

**Architecture:** 순수 빌더(`lib/faq/build/<t>.ts` — 페이지 데이터 → `FaqItem[]`) + 순수 가드 조립기(`lib/faq/compose.ts` — 동적 Q&A ≥ 2일 때만 `[동적, ...generic]` 반환, 미만이면 `null`) + `<Faq>` 컴포넌트에 `items` 경로 추가(기존 `category` 정적 경로 하위호환 유지). 각 상세 페이지는 관련 섹션 슬롯에 `{faq && <Faq items={faq} />}` 배선. FAQPage 스키마는 `<Faq>`가 `faqSchema(items)`로 방출.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트) · TypeScript · Prisma · Vitest.

## Global Constraints

- **enrich-not-hide.** 대량 noindex 금지. FAQ는 색인 페이지 enrich 수단.
- **동적 치환 ≥ 2.** 상세 FAQ는 페이지-치환 Q&A 2개 이상일 때만 렌더(정적 복붙 금지). 미만이면 FAQ 블록 생략.
- **수치는 데이터 있을 때만.** 값이 없으면 해당 Q&A 생략(지어내기 금지). 수치를 담은 Q&A는 **출처 라벨 필수**.
- **하위호환.** 허브의 기존 `<Faq category="..." />`(정적)는 동작 무변.
- **출처 문자열 통일:** apt=`국토교통부 실거래가 공개시스템`, hospital=`건강보험심사평가원`, subscription=`한국부동산원 청약홈`.
- **검증 게이트:** 각 태스크 종료 시 `pnpm typecheck && pnpm lint` green(메모리: ESLint no-unused-vars=error가 CI를 막음).
- **브랜치:** `main`에서 `feat/ws4-a1a-faq` 분기(finance 수정과 독립). 커밋 트레일러는 리포 규약 준수.

**File structure (이 plan이 만드는/고치는 파일):**
- Create `lib/faq/compose.ts` — 가드 조립기(순수)
- Modify `app/(public)/_components/faq.tsx` — `Faq`에 `items` 경로 추가
- Create `lib/faq/build/apt.ts` · `lib/faq/build/hospital.ts` · `lib/faq/build/subscription.ts` — 빌더(순수)
- Modify `app/(public)/apt/[id]/page.tsx` · `.../medical/hospital/[sigunguCode]/[id]/page.tsx` · `app/(public)/subscription/[id]/page.tsx` — 배선
- Test `tests/lib/faq/compose.test.ts` · `tests/lib/faq/build/{apt,hospital,subscription}.test.ts`

---

### Task 1: FAQ 인프라 — `composeDetailFaq` 가드 + `<Faq>` items 경로

**Files:**
- Create: `lib/faq/compose.ts`
- Modify: `app/(public)/_components/faq.tsx`
- Test: `tests/lib/faq/compose.test.ts`

**Interfaces:**
- Consumes: `FAQ`, `FaqCategory`, `FaqItem` (`lib/faq/data.ts`), `faqSchema`,`JsonLd` (`lib/seo/json-ld`), `FaqList` (기존)
- Produces: `composeDetailFaq(dynamic: FaqItem[], category: FaqCategory, minDynamic = 2): FaqItem[] | null` · `Faq({ category?: FaqCategory; items?: FaqItem[]; title?: string })`

- [ ] **Step 1: Write the failing test**

`tests/lib/faq/compose.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { composeDetailFaq } from '@/lib/faq/compose';
import { FAQ } from '@/lib/faq/data';

const dyn = (n: number) => Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));

describe('composeDetailFaq', () => {
  it('returns null when dynamic items are fewer than minDynamic (default 2)', () => {
    expect(composeDetailFaq(dyn(0), 'apt')).toBeNull();
    expect(composeDetailFaq(dyn(1), 'apt')).toBeNull();
  });

  it('merges dynamic items BEFORE the category generic bank when >= minDynamic', () => {
    const out = composeDetailFaq(dyn(2), 'apt');
    expect(out).not.toBeNull();
    expect(out!.slice(0, 2)).toEqual(dyn(2));
    expect(out!.slice(2)).toEqual(FAQ.apt);
  });

  it('respects a custom minDynamic', () => {
    expect(composeDetailFaq(dyn(2), 'apt', 3)).toBeNull();
    expect(composeDetailFaq(dyn(3), 'apt', 3)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/faq/compose.test.ts`
Expected: FAIL — `Cannot find module '@/lib/faq/compose'`.

- [ ] **Step 3: Create the compose helper**

`lib/faq/compose.ts`:
```ts
import { FAQ, type FaqCategory, type FaqItem } from '@/lib/faq/data';

/**
 * 상세페이지 FAQ 조립기(가드레일).
 * 페이지-치환 동적 Q&A가 minDynamic개 이상일 때만 [동적 + 카테고리 generic]을 반환한다.
 * 미만이면 null → 페이지는 FAQ 블록을 생략한다(정적 복붙으로 thin near-duplicate를 만들지 않는다).
 */
export function composeDetailFaq(
  dynamic: FaqItem[],
  category: FaqCategory,
  minDynamic = 2,
): FaqItem[] | null {
  if (dynamic.length < minDynamic) return null;
  return [...dynamic, ...(FAQ[category] ?? [])];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/faq/compose.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the `items` path to `<Faq>` (하위호환 유지)**

`app/(public)/_components/faq.tsx` — `Faq` 함수(현재 44-54행)를 아래로 교체. `FaqList`(정적/공용)는 무변.
```tsx
/** 랜딩(정적 카테고리) 또는 상세(페이지 치환 items) FAQ 아코디언 + FAQPage JSON-LD. */
export function Faq({
  category,
  items,
  title,
}: {
  category?: FaqCategory;
  items?: FaqItem[];
  title?: string;
}) {
  // 상세: 호출부가 composeDetailFaq로 이미 조립한 items를 전달. 허브: category만 → 정적 FAQ[category].
  const finalItems = items ?? (category ? FAQ[category] : undefined);
  if (!finalItems?.length) return null;
  return (
    <>
      <FaqList items={finalItems} title={title} />
      <JsonLd data={faqSchema(finalItems)} />
    </>
  );
}
```

- [ ] **Step 6: Verify typecheck + lint (기존 허브 `<Faq category>` 호출 회귀 없음)**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — `category`가 optional이 되어도 기존 호출부(`<Faq category="apt" />` 등)는 그대로 유효.

- [ ] **Step 7: Commit**

```bash
git add lib/faq/compose.ts app/(public)/_components/faq.tsx tests/lib/faq/compose.test.ts
git commit -m "feat(faq): 상세 FAQ 조립 가드(composeDetailFaq) + Faq items 경로

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG"
```

---

### Task 2: `buildAptFaq` + apt 상세 배선

**Files:**
- Create: `lib/faq/build/apt.ts`
- Test: `tests/lib/faq/build/apt.test.ts`
- Modify: `app/(public)/apt/[id]/page.tsx` (import + 슬롯 :173–174 사이)

**Interfaces:**
- Consumes: `FaqItem` (`lib/faq/data`), `formatBillion`,`formatDate` (`lib/format`), `composeDetailFaq` (Task 1), `Faq` (Task 1)
- Produces: `buildAptFaq(input: AptFaqInput): FaqItem[]` where
  `AptFaqInput = { property: { name: string; region: { sido: string }; saleLastPrice: bigint | null; saleLastAt: Date | null; saleAvgPrice12m: bigint | null; saleCount12m: number }; areaSummary: { area: number; jeonseRatioPct: number | null }[]; unifiedTotalCount: number }`
- 페이지 데이터 계약(확인됨): `property`(`Property & {region}`, notFound 가드 후 non-null), `areaSummary: AreaSummaryItem[]`(`area` 평·`jeonseRatioPct` %), `unified.totalCount`. 색인(narrative.fired≥3, trend|peer) ⇒ `saleLastPrice/saleAvgPrice12m` present. 금액은 만원 BigInt → `formatBillion`.

- [ ] **Step 1: Write the failing test**

`tests/lib/faq/build/apt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildAptFaq } from '@/lib/faq/build/apt';

const base = {
  property: {
    name: '샘플아파트',
    region: { sido: '서울특별시' },
    saleLastPrice: 85000n,          // 만원 → 8.5억
    saleLastAt: new Date('2026-06-15T00:00:00Z'),
    saleAvgPrice12m: 82000n,        // 8.2억
    saleCount12m: 12,
  },
  areaSummary: [{ area: 25, jeonseRatioPct: 62 }],
  unifiedTotalCount: 340,
};

describe('buildAptFaq', () => {
  it('substitutes name + latest sale price(억) + date with MOLIT source', () => {
    const items = buildAptFaq(base);
    const q = items.find((i) => i.q.includes('최근 매매 실거래가'));
    expect(q).toBeDefined();
    expect(q!.a).toContain('8.5억');
    expect(q!.a).toContain('2026-06-15');
    expect(q!.source).toBe('국토교통부 실거래가 공개시스템');
  });

  it('omits sale-based Q&A when sale aggregates are null (non-indexed)', () => {
    const items = buildAptFaq({
      ...base,
      property: { ...base.property, saleLastPrice: null, saleLastAt: null, saleAvgPrice12m: null },
    });
    expect(items.some((i) => i.q.includes('최근 매매 실거래가'))).toBe(false);
    expect(items.some((i) => i.a.includes('국토교통부'))).toBe(true); // 출처/거래량 항목은 always
  });

  it('includes 전세가율 only when a matching area ratio exists', () => {
    expect(buildAptFaq(base).some((i) => i.q.includes('전세가율'))).toBe(true);
    const noRatio = buildAptFaq({ ...base, areaSummary: [{ area: 25, jeonseRatioPct: null }] });
    expect(noRatio.some((i) => i.q.includes('전세가율'))).toBe(false);
  });

  it('produces >= 2 dynamic items on an indexed apt', () => {
    expect(buildAptFaq(base).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/faq/build/apt.test.ts`
Expected: FAIL — `Cannot find module '@/lib/faq/build/apt'`.

- [ ] **Step 3: Write the builder**

`lib/faq/build/apt.ts`:
```ts
import type { FaqItem } from '@/lib/faq/data';
import { formatBillion, formatDate } from '@/lib/format';

const MOLIT = '국토교통부 실거래가 공개시스템';

export interface AptFaqInput {
  property: {
    name: string;
    region: { sido: string };
    saleLastPrice: bigint | null;
    saleLastAt: Date | null;
    saleAvgPrice12m: bigint | null;
    saleCount12m: number;
  };
  areaSummary: { area: number; jeonseRatioPct: number | null }[];
  unifiedTotalCount: number;
}

/** 아파트 상세용 페이지-치환 FAQ(동적 항목만). generic 보강은 composeDetailFaq가 담당. */
export function buildAptFaq({ property, areaSummary, unifiedTotalCount }: AptFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = property.name;
  const loc = property.region.sido;

  if (property.saleLastPrice != null && property.saleLastAt != null) {
    items.push({
      q: `${name}의 최근 매매 실거래가는 얼마인가요?`,
      a: `가장 최근 신고된 매매 실거래가는 ${formatBillion(property.saleLastPrice)}(신고일 ${formatDate(property.saleLastAt)})입니다. 전용면적·층·거래 시점에 따라 가격이 달라지니 실거래 표를 함께 확인하세요.`,
      source: MOLIT,
    });
  }

  if (property.saleAvgPrice12m != null) {
    const pyeong = areaSummary[0]?.area;
    const areaPhrase = pyeong != null ? `대표 ${pyeong}평 기준 ` : '';
    items.push({
      q: `${name}의 최근 1년 매매 시세는 어느 정도인가요?`,
      a: `${areaPhrase}최근 12개월 매매 평균가는 ${formatBillion(property.saleAvgPrice12m)}입니다. 최근 1년 매매 ${property.saleCount12m.toLocaleString('ko-KR')}건 기준이며, 표본이 적은 평형은 편차가 클 수 있습니다.`,
      source: MOLIT,
    });
  }

  const ratio = areaSummary.find((a) => a.jeonseRatioPct != null)?.jeonseRatioPct;
  if (ratio != null) {
    items.push({
      q: `${name}의 전세가율은 어떻게 되나요?`,
      a: `동일 평형의 매매·전세 실거래로 계산한 전세가율은 약 ${ratio}%입니다. 매매가 대비 전세보증금 비율로, 표본 수에 따라 참고용으로 활용하세요.`,
      source: `${MOLIT} (동일 평형 매매·전세 파생)`,
    });
  }

  items.push({
    q: `${name}의 실거래 정보는 어떤 자료 기준인가요?`,
    a: `${loc} ${name}의 매매·전세·월세 실거래 총 ${unifiedTotalCount.toLocaleString('ko-KR')}건을 국토교통부 신고 자료 기준으로 정리했습니다. 계약일로부터 30일의 신고 기한이 있어 가장 최근 거래는 일시적으로 누락될 수 있습니다.`,
    source: MOLIT,
  });

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/faq/build/apt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into the apt detail page**

`app/(public)/apt/[id]/page.tsx` — 상단 import에 추가:
```tsx
import { Faq } from '@/app/(public)/_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildAptFaq } from '@/lib/faq/build/apt';
```
렌더 함수 안(`property`·`unified`·`areaSummary`가 이미 로드된 지점 이후)에 조립:
```tsx
  const aptFaq = composeDetailFaq(
    buildAptFaq({ property, areaSummary, unifiedTotalCount: unified.totalCount }),
    'apt',
  );
```
JSX 슬롯 — `<main>` 안, `<RelatedGuides pageKey="apt" />`(:173)와 `<MainSourceBlock id="molit-rtms" />`(:174) 사이:
```tsx
          <RelatedGuides pageKey="apt" />
          {aptFaq && <Faq items={aptFaq} />}
          <MainSourceBlock id="molit-rtms" />
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (`areaSummary`의 `AreaSummaryItem`은 `{area, jeonseRatioPct}`를 포함하므로 `AptFaqInput['areaSummary']`에 구조적 할당 가능. `unified.totalCount`는 `number`.)

- [ ] **Step 7: Commit**

```bash
git add lib/faq/build/apt.ts tests/lib/faq/build/apt.test.ts app/(public)/apt/[id]/page.tsx
git commit -m "feat(faq): 아파트 상세에 데이터 치환 FAQ + FAQPage 스키마

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG"
```

---

### Task 3: `buildHospitalFaq` + hospital 상세 배선

**Files:**
- Create: `lib/faq/build/hospital.ts`
- Test: `tests/lib/faq/build/hospital.test.ts`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` (import + 슬롯 :144–145 사이)

**Interfaces:**
- Consumes: `FaqItem` (`lib/faq/data`), `formatHospitalTime` (`lib/hospital/utils` — `(n:number|null|undefined)=>'HH:MM'|'휴진'`), `composeDetailFaq`,`Faq` (Task 1)
- Produces: `buildHospitalFaq(input: HospitalFaqInput): FaqItem[]` where
  `HospitalFaqInput = { name: string; typeName: string; sigungu: string | null; sido: string | null; depts: { deptName: string }[]; totalDoctors: number | null; detail: { openMon: number | null; closeMon: number | null; erDayOpen: string | null; erNightOpen: string | null } | null }`
- 데이터 계약(확인됨): `hospital.detail`/`hospital.facility`는 nullable 관계, 시간필드는 HHMM 정수(→`formatHospitalTime`), `erDayOpen/erNightOpen`은 `'Y'/'N'` 문자열. 색인(narrative requireKeys depts·doctors) ⇒ `depts` 비어있지 않고 `totalDoctors≥1`.

- [ ] **Step 1: Write the failing test**

`tests/lib/faq/build/hospital.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildHospitalFaq } from '@/lib/faq/build/hospital';

const base = {
  name: '샘플의원',
  typeName: '의원',
  sigungu: '강남구',
  sido: '서울특별시',
  depts: [{ deptName: '내과' }, { deptName: '가정의학과' }],
  totalDoctors: 5,
  detail: { openMon: 900, closeMon: 1800, erDayOpen: 'N', erNightOpen: 'N' },
};

describe('buildHospitalFaq', () => {
  it('lists 진료과 with hospital name and HIRA source', () => {
    const q = buildHospitalFaq(base).find((i) => i.q.includes('진료과'));
    expect(q!.a).toContain('내과');
    expect(q!.source).toBe('건강보험심사평가원');
  });

  it('renders 진료시간 via formatHospitalTime (HHMM ints → HH:MM)', () => {
    const q = buildHospitalFaq(base).find((i) => i.q.includes('진료시간'));
    expect(q!.a).toContain('09:00');
    expect(q!.a).toContain('18:00');
  });

  it('omits 진료시간 when detail is null but keeps >= 2 dynamic (depts + doctors)', () => {
    const items = buildHospitalFaq({ ...base, detail: null });
    expect(items.some((i) => i.q.includes('진료시간'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('reports 응급실 운영 as 주간·야간 모두 운영 when both flags are Y', () => {
    const items = buildHospitalFaq({ ...base, detail: { ...base.detail, erDayOpen: 'Y', erNightOpen: 'Y' } });
    expect(items.find((i) => i.q.includes('응급실'))!.a).toContain('주간·야간 모두 운영');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/faq/build/hospital.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

`lib/faq/build/hospital.ts`:
```ts
import type { FaqItem } from '@/lib/faq/data';
import { formatHospitalTime } from '@/lib/hospital/utils';

const HIRA = '건강보험심사평가원';

export interface HospitalFaqInput {
  name: string;
  typeName: string;
  sigungu: string | null;
  sido: string | null;
  depts: { deptName: string }[];
  totalDoctors: number | null;
  detail: {
    openMon: number | null;
    closeMon: number | null;
    erDayOpen: string | null;
    erNightOpen: string | null;
  } | null;
}

/** 병원 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildHospitalFaq(h: HospitalFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = h.name;
  const loc = h.sigungu ?? h.sido ?? '';
  const locPrefix = loc ? `${loc} ` : '';

  if (h.depts.length > 0) {
    const names = h.depts.slice(0, 5).map((d) => d.deptName).join(', ');
    const more = h.depts.length > 5 ? ` 등 ${h.depts.length}개 과` : '';
    items.push({
      q: `${name}은 어떤 진료과가 있나요?`,
      a: `${locPrefix}${name}(${h.typeName})의 진료과는 ${names}${more}입니다. 세부 진료 항목은 방문 전 병원에 확인하세요.`,
      source: HIRA,
    });
  }

  if (h.detail?.openMon != null && h.detail?.closeMon != null) {
    items.push({
      q: `${name}의 진료시간은 어떻게 되나요?`,
      a: `평일(월) 기준 ${formatHospitalTime(h.detail.openMon)}~${formatHospitalTime(h.detail.closeMon)}에 진료합니다. 요일별 진료시간·점심시간은 병원 사정으로 달라질 수 있어 방문 전 확인을 권장합니다.`,
      source: HIRA,
    });
  }

  if (h.detail?.erDayOpen != null || h.detail?.erNightOpen != null) {
    const day = h.detail?.erDayOpen === 'Y';
    const night = h.detail?.erNightOpen === 'Y';
    const er = day && night ? '주간·야간 모두 운영' : night ? '야간 운영' : day ? '주간 운영' : '운영하지 않음';
    items.push({
      q: `${name}에 응급실이 있나요?`,
      a: `등록 정보 기준 응급실은 ${er}입니다. 응급 상황은 국번없이 119 또는 응급의료포털을 함께 이용하세요.`,
      source: HIRA,
    });
  }

  if (h.totalDoctors != null && h.totalDoctors > 0) {
    items.push({
      q: `${name}의 의료진 규모는 어느 정도인가요?`,
      a: `심사평가원 신고 기준 총 의사 수는 ${h.totalDoctors.toLocaleString('ko-KR')}명입니다. 진료과별 세부 구성은 병원에 문의하세요.`,
      source: HIRA,
    });
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/faq/build/hospital.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into the hospital detail page**

`app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` — 상단 import 추가:
```tsx
import { Faq } from '@/app/(public)/_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildHospitalFaq } from '@/lib/faq/build/hospital';
```
렌더 함수 안(`hospital` 로드 이후) 조립:
```tsx
  const hospitalFaq = composeDetailFaq(
    buildHospitalFaq({
      name: hospital.name,
      typeName: hospital.typeName,
      sigungu: hospital.sigungu,
      sido: hospital.sido,
      depts: hospital.depts,
      totalDoctors: hospital.totalDoctors,
      detail: hospital.detail
        ? {
            openMon: hospital.detail.openMon,
            closeMon: hospital.detail.closeMon,
            erDayOpen: hospital.detail.erDayOpen,
            erNightOpen: hospital.detail.erNightOpen,
          }
        : null,
    }),
    'hospital',
  );
```
JSX 슬롯 — `<div className="flex flex-col gap-6">`(:131) 안, `<RelatedGuides pageKey="medical/hospital" />`(:144)와 `<MainSourceBlock id="hira" />`(:145) 사이:
```tsx
          <RelatedGuides pageKey="medical/hospital" />
          {hospitalFaq && <Faq items={hospitalFaq} />}
          <MainSourceBlock id="hira" />
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (`hospital.depts`는 `{deptName}` 포함, `detail` 필드는 optional-chain으로 매핑.)

- [ ] **Step 7: Commit**

```bash
git add lib/faq/build/hospital.ts tests/lib/faq/build/hospital.test.ts "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(faq): 병원 상세에 데이터 치환 FAQ + FAQPage 스키마

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG"
```

---

### Task 4: `buildSubscriptionFaq` + subscription 상세 배선

**Files:**
- Create: `lib/faq/build/subscription.ts`
- Test: `tests/lib/faq/build/subscription.test.ts`
- Modify: `app/(public)/subscription/[id]/page.tsx` (import + 슬롯 :133–134 사이)

**Interfaces:**
- Consumes: `FaqItem` (`lib/faq/data`), `formatReceiptPeriodShort`,`formatMoveInYm` (`lib/format`), `deriveStatus`,`STATUS_LABEL`,`categoryLabel` (`lib/subscription`), `composeDetailFaq`,`Faq` (Task 1)
- Produces: `buildSubscriptionFaq(input: SubscriptionFaqInput): FaqItem[]` where
  `SubscriptionFaqInput = { name: string; regionName: string | null; totalSupply: number | null; receiptBegin: Date | null; receiptEnd: Date | null; category: SubscriptionCategory; moveInYm: string | null; unitCount: number }`
- 데이터 계약(확인됨): `deriveStatus(begin,end)→{status:'OPEN'|'UPCOMING'|'CLOSED',dday}`, `STATUS_LABEL[status]`, `categoryLabel(category)` 한글 라벨(raw enum 금지), `formatReceiptPeriodShort`는 nullable 입력 안전(둘 다 null→'일정 미정'). `SubscriptionCategory` 멤버: `APT|OFFICETEL_ETC|REMNANT|PUB_PRIV_RENT|ARBITRARY|LH_PRESUB`. 색인 조건: `totalSupply != null || units.length > 0`. `totalSupply` Q&A는 반드시 null 가드.

- [ ] **Step 1: Write the failing test**

`tests/lib/faq/build/subscription.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSubscriptionFaq } from '@/lib/faq/build/subscription';

const base = {
  name: '샘플단지',
  regionName: '서울 강남구',
  totalSupply: 500,
  receiptBegin: new Date('2026-08-01T00:00:00Z'),
  receiptEnd: new Date('2026-08-05T00:00:00Z'),
  category: 'APT' as const,
  moveInYm: '202812',
  unitCount: 3,
};

describe('buildSubscriptionFaq', () => {
  it('always yields >= 2 dynamic items, all tagged 청약홈', () => {
    const items = buildSubscriptionFaq(base);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.source === '한국부동산원 청약홈')).toBe(true);
  });

  it('substitutes the receipt period into the schedule Q&A', () => {
    const q = buildSubscriptionFaq(base).find((i) => i.q.includes('접수 일정'));
    expect(q!.a).toContain('08.01~08.05');
  });

  it('omits the 세대수 Q&A when totalSupply is null (still >= 2)', () => {
    const items = buildSubscriptionFaq({ ...base, totalSupply: null });
    expect(items.some((i) => i.q.includes('공급 세대수'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/faq/build/subscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

`lib/faq/build/subscription.ts`:
```ts
import type { FaqItem } from '@/lib/faq/data';
import type { SubscriptionCategory } from '@prisma/client';
import { formatReceiptPeriodShort, formatMoveInYm } from '@/lib/format';
import { deriveStatus, STATUS_LABEL, categoryLabel } from '@/lib/subscription';

const APPLY = '한국부동산원 청약홈';

export interface SubscriptionFaqInput {
  name: string;
  regionName: string | null;
  totalSupply: number | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  category: SubscriptionCategory;
  moveInYm: string | null;
  unitCount: number;
}

/** 청약 상세용 페이지-치환 FAQ(동적 항목만). 일정+유형은 항상 생성(≥2 보장). */
export function buildSubscriptionFaq(n: SubscriptionFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = n.name;
  const locPrefix = n.regionName ? `${n.regionName} ` : '';

  const status = deriveStatus(n.receiptBegin, n.receiptEnd);
  const period = formatReceiptPeriodShort(n.receiptBegin, n.receiptEnd);
  items.push({
    q: `${name}의 청약 접수 일정은 언제인가요?`,
    a: `접수 기간은 ${period}이며 현재 상태는 '${STATUS_LABEL[status.status]}'입니다. 실제 청약 신청은 청약홈에서 진행되며, 일정은 변경될 수 있어 공고를 확인하세요.`,
    source: APPLY,
  });

  if (n.totalSupply != null) {
    const models = n.unitCount > 0 ? ` 주택형 ${n.unitCount.toLocaleString('ko-KR')}개` : '';
    items.push({
      q: `${name}의 공급 세대수는 얼마나 되나요?`,
      a: `${locPrefix}${name}의 공급 규모는 총 ${n.totalSupply.toLocaleString('ko-KR')}세대${models}입니다. 자세한 주택형·공급 세대는 공급 정보를 확인하세요.`,
      source: APPLY,
    });
  }

  items.push({
    q: `${name}은 어떤 유형의 청약인가요?`,
    a: `${name}은 '${categoryLabel(n.category)}' 유형입니다. 유형에 따라 자격 요건과 신청 방법이 다르니 공고의 자격 조건을 확인하세요.`,
    source: APPLY,
  });

  const moveIn = formatMoveInYm(n.moveInYm);
  if (moveIn !== '-') {
    items.push({
      q: `${name}의 입주 예정 시기는 언제인가요?`,
      a: `입주 예정월은 ${moveIn}입니다. 사업 일정에 따라 변동될 수 있습니다.`,
      source: APPLY,
    });
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/faq/build/subscription.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the subscription detail page**

`app/(public)/subscription/[id]/page.tsx` — 상단 import 추가:
```tsx
import { Faq } from '@/app/(public)/_components/faq';
import { composeDetailFaq } from '@/lib/faq/compose';
import { buildSubscriptionFaq } from '@/lib/faq/build/subscription';
```
렌더 함수 안(`notice` notFound 가드 이후) 조립:
```tsx
  const subscriptionFaq = composeDetailFaq(
    buildSubscriptionFaq({
      name: notice.name,
      regionName: notice.regionName,
      totalSupply: notice.totalSupply,
      receiptBegin: notice.receiptBegin,
      receiptEnd: notice.receiptEnd,
      category: notice.category,
      moveInYm: notice.moveInYm,
      unitCount: notice.units.length,
    }),
    'subscription',
  );
```
JSX 슬롯 — `<main>` 안, `<RelatedGuides pageKey="subscription" />`(:133)와 `<MainSourceBlock id={subscriptionSource(notice.category)} />`(:134) 사이:
```tsx
          <RelatedGuides pageKey="subscription" />
          {subscriptionFaq && <Faq items={subscriptionFaq} />}
          <MainSourceBlock id={subscriptionSource(notice.category)} />
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/faq/build/subscription.ts tests/lib/faq/build/subscription.test.ts "app/(public)/subscription/[id]/page.tsx"
git commit -m "feat(faq): 청약 상세에 데이터 치환 FAQ + FAQPage 스키마

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG"
```

---

### Task 5: Phase A1a 통합 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 유닛 테스트**

Run: `pnpm exec vitest run tests/lib/faq`
Expected: PASS — compose 3 + apt 4 + hospital 4 + subscription 3.

- [ ] **Step 2: 정적 게이트**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, `✔ No ESLint warnings or errors`.

- [ ] **Step 3: 봇 가독성(로컬 렌더) 확인**

로컬 dev를 운영 DB로 띄워(`pnpm dev`) apt·hospital·subscription 상세 한 건씩 JS 미실행 fetch(`curl -s localhost:3000/apt/<id>`)로:
- 본문 HTML에 치환된 Q&A 텍스트(단지명/진료과/접수일정 등) 존재.
- `<script type="application/ld+json">`에 `"@type":"FAQPage"` 존재.
- 같은 카테고리 두 페이지의 FAQ 값이 서로 다름.
※ 운영 사이트(imjangon.co.kr)에는 요청 버스트 금지(Vercel 챌린지).

- [ ] **Step 4: 배포 후 리치결과 검증(수동, 별도)**

배포 후 구글 리치결과 검사로 apt/hospital/subscription 상세 URL의 FAQ 인식 확인 + GSC 커버리지 관찰.

- [ ] **Step 5: PR 생성 (요청 시)**

`feat/ws4-a1a-faq` → `main` PR. 본문에 spec(`docs/adsense/ws4-part-a-enrich-gate-design.md`) 링크.

---

## 후속 plan (본 plan 범위 밖 — 각자 별도 plan)

- **A1b — 나머지 6종 FAQ:** villa · officetel(apt 빌더 재사용/변주) · school · childcare · finance · jeonse-guarantee. 파일럿에서 확정된 `buildXFaq`+`composeDetailFaq`+`<Faq items>` 패턴을 그대로 이식. 각 템플릿 데이터 계약 추출 → 빌더 → 배선.
- **A2 — POI 사이트맵↔noindex 동기화** + childcare 필터(스키마 선확인).
- **A3 — 최얇은 표면:** amenity JSON-LD+경량 FAQ, finance/jeonse `FinancialProduct` 스키마, `page-category.ts`에 `urban→LIFE`.
- **A4 — 빌라 L2 재결정:** 매매 있으나 서사 미발화 잔여 측정 → 폴백/noindex 결정.

## Self-Review (spec 대조)

- **Spec 커버리지:** spec §2(A1 아키텍처·빌더·가드·수용기준) → Task 1–5로 구현(파일럿 3종). §3 A2/§4 A3/§5 A4 → 후속 plan로 명시(스코프 분리, 각자 testable 산출물). ✔
- **Placeholder 스캔:** 모든 코드/명령/기대출력 실체 기입, "TBD/similar to" 없음. ✔
- **타입 일관성:** `composeDetailFaq(FaqItem[],FaqCategory,number)→FaqItem[]|null`·`Faq({category?,items?,title?})`·`buildAptFaq/HospitalFaq/SubscriptionFaq` 입력·반환이 Task 간 일치. 헬퍼 시그니처(`formatBillion`/`formatDate`/`formatHospitalTime`/`deriveStatus`/`STATUS_LABEL`/`categoryLabel`/`formatReceiptPeriodShort`/`formatMoveInYm`)는 코드에서 확인된 실제 시그니처. ✔
