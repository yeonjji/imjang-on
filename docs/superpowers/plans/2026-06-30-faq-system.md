# FAQ 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ilsangkit과 동일하게 섹션 랜딩 페이지마다 카테고리별 FAQ를 노출하고, 통합 `/faq` 페이지·footer 링크·FAQPage JSON-LD를 추가한다.

**Architecture:** 정적 TS 레지스트리(`lib/faq/data.ts`)에 카테고리별 Q&A를 보관한다. 재사용 서버 컴포넌트(`Faq`/`FaqList`)가 네이티브 `<details>` 아코디언을 렌더하고 FAQPage JSON-LD를 방출한다. 각 랜딩 페이지는 `<Faq category="..." />` 한 줄로 통합하고, 신규 `/faq` 페이지는 전체를 묶어 단일 FAQPage 스키마로 노출한다.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트), TypeScript, Tailwind v4, Vitest v2.

## Global Constraints

- 디자인 토큰만 사용: 그림자는 `--shadow-soft` 하나, 색은 `--color-*` 토큰. 한글 본문 14px 이상(`text-sm` 이상). (DESIGN.md)
- 모든 신규 페이지는 `metadata`에 `title`·`description`·`alternates.canonical` 포함.
- FAQPage JSON-LD는 한 페이지에 **1개**만(여러 FAQPage 엔티티 금지).
- 깊은 상세 페이지(`/apt/[id]`, 자치구 목록, 개별 시설 상세)에는 FAQ를 **삽입하지 않는다.**
- 접근성: 아코디언은 네이티브 `<details>/<summary>` 사용(WCAG 2.1 AA).
- 컨테이너 폭: 랜딩 섹션은 `max-w-[1180px]`, `/faq` 본문은 `max-w-3xl`.

---

## File Structure

- Create `lib/faq/data.ts` — FAQ 레지스트리(타입, 카테고리 라벨, 페이지 노출 순서, Q&A 콘텐츠).
- Modify `lib/seo/json-ld.tsx` — `faqSchema()` 추가.
- Create `app/(public)/_components/faq.tsx` — `FaqList`(프레젠테이션) + `Faq`(랜딩 래퍼, JSON-LD 포함).
- Create `app/(public)/faq/page.tsx` — 통합 FAQ 페이지.
- Modify `lib/sitemap/static-entries.ts` — `/faq` 엔트리 추가.
- Modify `app/(public)/_components/footer.tsx` — "자주 묻는 질문" 링크.
- Modify 랜딩 페이지 12곳 — `<Faq category="..." />` 삽입.
- Create `tests/lib/faq.test.ts` — 데이터 무결성 테스트.
- Create `tests/lib/json-ld.test.ts` (없으면 신규) — `faqSchema` 테스트.

---

## Task 1: `faqSchema()` JSON-LD 함수

**Files:**
- Modify: `lib/seo/json-ld.tsx`
- Test: `tests/lib/json-ld.test.ts`

**Interfaces:**
- Produces: `faqSchema(items: { q: string; a: string }[]): Json` — `@type: 'FAQPage'`, `mainEntity`에 `Question`/`acceptedAnswer(Answer)` 매핑.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/json-ld.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { faqSchema } from '@/lib/seo/json-ld';

describe('faqSchema', () => {
  const items = [
    { q: '아파트 실거래가는 어디서 확인하나요?', a: '국토교통부 실거래가 공개시스템 신고 자료를 단지별로 정리해 제공합니다.' },
    { q: '실거래가와 호가는 어떻게 다른가요?', a: '실거래가는 실제 체결·신고된 금액이고, 호가는 매도인의 희망 가격입니다.' },
  ];

  it('FAQPage 타입과 schema.org 컨텍스트를 가진다', () => {
    const s = faqSchema(items) as Record<string, unknown>;
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('FAQPage');
  });

  it('각 항목을 Question/acceptedAnswer로 매핑한다', () => {
    const s = faqSchema(items) as { mainEntity: Array<Record<string, unknown>> };
    expect(s.mainEntity).toHaveLength(2);
    const first = s.mainEntity[0];
    expect(first['@type']).toBe('Question');
    expect(first.name).toBe(items[0].q);
    const ans = first.acceptedAnswer as Record<string, unknown>;
    expect(ans['@type']).toBe('Answer');
    expect(ans.text).toBe(items[0].a);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/json-ld.test.ts`
Expected: FAIL — `faqSchema` is not exported / not a function.

- [ ] **Step 3: 최소 구현**

`lib/seo/json-ld.tsx`의 `JsonLd` 컴포넌트 정의 바로 앞(파일 끝 함수 영역)에 추가:

```tsx
export function faqSchema(items: { q: string; a: string }[]): Json {
  return {
    ...ctx,
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/json-ld.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/json-ld.tsx tests/lib/json-ld.test.ts
git commit -m "feat(faq): faqSchema FAQPage JSON-LD 추가"
```

---

## Task 2: FAQ 데이터 레지스트리

**Files:**
- Create: `lib/faq/data.ts`
- Test: `tests/lib/faq.test.ts`

**Interfaces:**
- Produces:
  - `interface FaqItem { q: string; a: string; source?: string }`
  - `type FaqCategory = 'apt' | 'officetel' | 'villa' | 'subscription' | 'finance' | 'jeonse-guarantee' | 'hospital' | 'pharmacy' | 'school' | 'childcare' | 'life' | 'region'`
  - `const FAQ: Record<FaqCategory, FaqItem[]>`
  - `const FAQ_CATEGORY_LABEL: Record<FaqCategory, string>`
  - `const FAQ_PAGE_ORDER: FaqCategory[]` — `/faq` 페이지 노출 순서

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/faq.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { FAQ, FAQ_CATEGORY_LABEL, FAQ_PAGE_ORDER, type FaqCategory } from '@/lib/faq/data';

const CATEGORIES = Object.keys(FAQ) as FaqCategory[];

describe('FAQ 레지스트리 무결성', () => {
  it('모든 카테고리가 최소 3개 항목을 가진다', () => {
    for (const c of CATEGORIES) {
      expect(FAQ[c].length, `${c} 항목 수`).toBeGreaterThanOrEqual(3);
    }
  });

  it('모든 항목의 q는 물음표로 끝나고 a는 비어있지 않다', () => {
    for (const c of CATEGORIES) {
      for (const item of FAQ[c]) {
        expect(item.q.trim().length, `${c} q`).toBeGreaterThan(0);
        expect(item.q.trim().endsWith('?'), `${c} q="${item.q}"`).toBe(true);
        expect(item.a.trim().length, `${c} a`).toBeGreaterThan(10);
      }
    }
  });

  it('카테고리 내 질문이 중복되지 않는다', () => {
    for (const c of CATEGORIES) {
      const qs = FAQ[c].map((i) => i.q);
      expect(new Set(qs).size, `${c} 중복`).toBe(qs.length);
    }
  });

  it('모든 카테고리에 라벨이 있고 노출 순서에 포함된다', () => {
    for (const c of CATEGORIES) {
      expect(FAQ_CATEGORY_LABEL[c], `${c} 라벨`).toBeTruthy();
      expect(FAQ_PAGE_ORDER, `${c} 순서`).toContain(c);
    }
    expect(new Set(FAQ_PAGE_ORDER).size).toBe(FAQ_PAGE_ORDER.length);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/faq.test.ts`
Expected: FAIL — Cannot find module '@/lib/faq/data'.

- [ ] **Step 3: 데이터 파일 작성**

`lib/faq/data.ts` 생성 (아래 전체 내용 그대로):

```ts
export interface FaqItem {
  q: string;
  a: string;
  /** 관련 시 데이터 출처 라벨(예: "국토교통부 실거래가 공개시스템") */
  source?: string;
}

export type FaqCategory =
  | 'apt'
  | 'officetel'
  | 'villa'
  | 'subscription'
  | 'finance'
  | 'jeonse-guarantee'
  | 'hospital'
  | 'pharmacy'
  | 'school'
  | 'childcare'
  | 'life'
  | 'region';

export const FAQ_CATEGORY_LABEL: Record<FaqCategory, string> = {
  apt: '아파트 실거래가',
  officetel: '오피스텔 실거래가',
  villa: '연립·다세대 실거래가',
  subscription: '청약',
  finance: '대출·금융',
  'jeonse-guarantee': '전세보증',
  hospital: '병원',
  pharmacy: '약국',
  school: '학교',
  childcare: '어린이집',
  life: '생활편의 시설',
  region: '지역별 시세',
};

/** /faq 통합 페이지에서의 섹션 노출 순서 */
export const FAQ_PAGE_ORDER: FaqCategory[] = [
  'apt',
  'officetel',
  'villa',
  'region',
  'subscription',
  'finance',
  'jeonse-guarantee',
  'hospital',
  'pharmacy',
  'school',
  'childcare',
  'life',
];

const MOLIT = '국토교통부 실거래가 공개시스템';
const APPLY = '한국부동산원 청약홈';
const HIRA = '건강보험심사평가원';

export const FAQ: Record<FaqCategory, FaqItem[]> = {
  apt: [
    {
      q: '아파트 실거래가는 어디서 확인하나요?',
      a: '국토교통부에 신고된 실거래가를 단지별로 정리해 보여드립니다. 계약 체결 후 30일 이내 신고된 공식 거래 금액 기준입니다.',
      source: MOLIT,
    },
    {
      q: '실거래가와 호가는 어떻게 다른가요?',
      a: '실거래가는 실제 계약이 체결되어 신고된 확정 금액이고, 호가는 매도인이 희망하는 미확정 가격입니다. 시세 판단은 실거래가를 기준으로 하는 것이 정확합니다.',
    },
    {
      q: '전세·월세 실거래가도 볼 수 있나요?',
      a: '매매뿐 아니라 전세·월세 실거래가도 제공합니다. 전월세는 임대차 신고제와 확정일자 자료를 기반으로 합니다.',
      source: MOLIT,
    },
    {
      q: '같은 단지인데 거래 가격 차이가 큰 이유는 무엇인가요?',
      a: '전용면적, 층, 향, 동, 거래 시점에 따라 가격이 달라집니다. 비교할 때는 전용면적과 거래일을 함께 확인하는 것이 좋습니다.',
    },
    {
      q: '최근 거래가 실거래가에 안 보일 수 있나요?',
      a: '계약일로부터 30일의 신고 기한이 있어, 가장 최근 거래는 아직 신고되지 않아 일시적으로 누락될 수 있습니다.',
      source: MOLIT,
    },
  ],
  officetel: [
    {
      q: '오피스텔 실거래가는 어떻게 확인하나요?',
      a: '국토교통부에 신고된 오피스텔 매매·전월세 실거래가를 단지별로 제공합니다.',
      source: MOLIT,
    },
    {
      q: '주거용과 업무용 오피스텔은 무엇이 다른가요?',
      a: '사용 용도에 따라 전입신고 가능 여부, 세제, 주택 수 산정, 청약 자격 등이 달라집니다. 실거주 목적이라면 주거용 여부를 확인해야 합니다.',
    },
    {
      q: '오피스텔도 전용면적 기준으로 보면 되나요?',
      a: '오피스텔은 계약면적 대비 전용률이 아파트보다 낮은 편이라, 실제 사용 공간을 가늠하려면 전용면적을 확인하는 것이 중요합니다.',
    },
  ],
  villa: [
    {
      q: '빌라(연립·다세대)와 아파트는 무엇이 다른가요?',
      a: '세대 규모, 관리 방식, 시세 형성 방식이 다릅니다. 빌라는 거래량이 적어 시세 변동 폭이 크고 표본이 적은 편입니다.',
    },
    {
      q: '빌라 매매 시 특히 주의할 점은 무엇인가요?',
      a: '전세가율, 근저당 설정, 건축물대장상 위반건축물 여부를 확인하는 것이 좋습니다. 비교 가능한 실거래 표본이 적다는 점도 유의하세요.',
    },
    {
      q: '빌라 실거래가 표본이 적은 이유는 무엇인가요?',
      a: '아파트에 비해 거래 자체가 적어 통계의 신뢰 구간이 넓습니다. 인근 유사 매물과 함께 참고하는 것이 좋습니다.',
      source: MOLIT,
    },
  ],
  subscription: [
    {
      q: '청약 일정은 어디서 확인하나요?',
      a: '한국부동산원 청약홈의 모집공고를 기반으로 접수 일정과 자격을 정리해 보여드립니다.',
      source: APPLY,
    },
    {
      q: '청약 신청은 어디서 하나요?',
      a: '실제 청약 신청은 청약홈에서 진행됩니다. 임장ON은 공고·일정·단지 정보를 안내하는 역할입니다.',
      source: APPLY,
    },
    {
      q: '무순위·임의공급 청약은 무엇인가요?',
      a: '미계약·미분양 등으로 남은 물량을 추가로 공급하는 방식입니다. 자격 요건이 일반공급과 다를 수 있어 공고를 꼭 확인해야 합니다.',
    },
    {
      q: '사전청약과 본청약은 어떻게 다른가요?',
      a: '사전청약은 본청약에 앞서 일부 물량을 우선 공급하는 제도로, 일정과 자격 요건이 본청약과 별도로 운영됩니다.',
    },
  ],
  finance: [
    {
      q: '어떤 대출 상품 정보를 제공하나요?',
      a: '한국주택금융공사 등 공적 보증·정책 기반 주택 관련 대출 상품 정보를 정리해 제공합니다.',
    },
    {
      q: '실제 대출 한도와 금리는 어떻게 정해지나요?',
      a: '소득, 신용, 담보, 정책 조건에 따라 개인별로 달라집니다. 제공되는 정보는 상품의 상한·조건을 안내하기 위한 것입니다.',
    },
    {
      q: '대출 신청은 어디서 하나요?',
      a: '실제 신청과 심사는 취급 금융기관이나 공사에서 진행됩니다. 임장ON은 상품 비교·안내를 돕습니다.',
    },
  ],
  'jeonse-guarantee': [
    {
      q: '전세보증금 반환보증이 무엇인가요?',
      a: '임대인이 보증금을 돌려주지 못할 때 보증기관이 대신 반환해 주는 제도입니다. HUG, HF, SGI 등에서 운영합니다.',
    },
    {
      q: '전세보증 한도는 어떻게 정해지나요?',
      a: '주택 가격과 전세가율을 기준으로 상한이 정해집니다. 제공되는 한도는 상한 안내이며, 실제 한도는 보증기관 심사로 확정됩니다.',
    },
    {
      q: '전세보증 가입은 언제·어디서 하나요?',
      a: '보증기관 또는 위탁 금융기관을 통해 가입하며, 계약 초기에 가입하는 것이 유리합니다.',
    },
  ],
  hospital: [
    {
      q: '야간·주말에 진료받을 수 있는 병원은 어떻게 찾나요?',
      a: '심사평가원이 제공하는 진료시간 정보를 기반으로 운영 시간을 표기합니다. 응급 상황은 응급의료포털·119도 함께 활용하세요.',
      source: HIRA,
    },
    {
      q: '표시된 진료시간과 진료과는 정확한가요?',
      a: '건강보험심사평가원 공공데이터를 기반으로 하지만, 병원 사정으로 변동될 수 있어 방문 전 확인을 권장합니다.',
      source: HIRA,
    },
    {
      q: '1차·2차·3차 병원은 어떻게 다른가요?',
      a: '의원(1차), 병원(2차), 상급종합병원(3차)으로 나뉩니다. 상위 병원 이용 시 진료의뢰서가 필요하고 본인부담금도 달라집니다.',
    },
  ],
  pharmacy: [
    {
      q: '야간·공휴일에 문을 여는 약국은 어떻게 찾나요?',
      a: '심사평가원 운영시간 데이터를 기반으로 운영 약국 정보를 제공합니다.',
      source: HIRA,
    },
    {
      q: '처방전 없이 살 수 있는 약이 있나요?',
      a: '일반의약품은 처방전 없이 구매할 수 있지만, 전문의약품은 의사의 처방전이 필요합니다.',
    },
    {
      q: '약국 위치와 운영시간 정보의 출처는 무엇인가요?',
      a: '건강보험심사평가원이 공개하는 공공데이터를 기반으로 합니다.',
      source: HIRA,
    },
  ],
  school: [
    {
      q: '학교 정보는 어디서 가져오나요?',
      a: '교육부 및 학교 공시 공공데이터를 기반으로 위치·기본 정보를 제공합니다.',
    },
    {
      q: '입학·전학 문의는 어디로 해야 하나요?',
      a: '배정·전학 등 행정 절차는 관할 교육지원청과 해당 학교에 문의해야 합니다. 임장ON은 위치와 기본 정보를 안내합니다.',
    },
    {
      q: '특목고나 특수학교 정보도 확인할 수 있나요?',
      a: '공시 정보 범위 내에서 다양한 학교 유형의 기본 정보를 제공합니다.',
    },
  ],
  childcare: [
    {
      q: '어린이집 유형(국공립·민간·가정)은 무엇이 다른가요?',
      a: '설립 주체, 정원 규모, 비용 등에서 차이가 있습니다. 가정어린이집은 규모가 작고, 국공립은 대기 수요가 많은 편입니다.',
    },
    {
      q: '표시된 정원·현원 정보는 정확한가요?',
      a: '보건복지부 공공데이터를 기반으로 하며, 실시간 변동은 해당 시설에 직접 확인하는 것이 정확합니다.',
    },
    {
      q: '어린이집 입소 신청은 어디서 하나요?',
      a: '입소 대기 신청은 임신육아종합포털(아이사랑)에서 진행됩니다. 임장ON은 위치와 기본 정보를 안내합니다.',
    },
  ],
  life: [
    {
      q: '어떤 생활편의 시설 정보를 제공하나요?',
      a: '공원, 공영주차장, 전기차 충전소, 전통시장 등 생활 밀착형 공공시설 정보를 공공데이터 기반으로 제공합니다.',
    },
    {
      q: '시설 정보는 얼마나 자주 갱신되나요?',
      a: '출처 기관의 데이터 갱신 주기에 맞춰 주기적으로 반영합니다. 운영 정보는 변동될 수 있습니다.',
    },
    {
      q: '실시간 이용·혼잡 정보도 제공하나요?',
      a: '기본 위치와 운영 정보 위주로 제공하며, 시설에 따라 실시간 정보는 제공되지 않을 수 있습니다.',
    },
  ],
  region: [
    {
      q: '지역별 시세는 어떻게 산출되나요?',
      a: '국토교통부에 신고된 실거래가를 지역(시군구) 단위로 집계해 보여드립니다.',
      source: MOLIT,
    },
    {
      q: '평당가는 어떤 기준인가요?',
      a: '전용면적 기준 거래 금액을 3.3㎡(평)로 환산한 통계치입니다. 단지·면적별 편차가 있으니 참고용으로 활용하세요.',
    },
    {
      q: '거래 표본이 적은 지역은 어떻게 표시되나요?',
      a: '표본이 부족한 지역은 통계 신뢰도가 낮아질 수 있어 참고용으로만 활용하시길 권장합니다.',
    },
  ],
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/faq.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: 커밋**

```bash
git add lib/faq/data.ts tests/lib/faq.test.ts
git commit -m "feat(faq): 카테고리별 FAQ 데이터 레지스트리 추가"
```

---

## Task 3: 재사용 FAQ 컴포넌트

**Files:**
- Create: `app/(public)/_components/faq.tsx`

**Interfaces:**
- Consumes: `FAQ`, `FaqCategory`, `FaqItem` (Task 2); `faqSchema`, `JsonLd` (Task 1).
- Produces:
  - `FaqList({ items: FaqItem[]; title?: string })` — JSON-LD 없는 프레젠테이션 아코디언.
  - `Faq({ category: FaqCategory; title?: string })` — `FaqList` + 해당 카테고리 FAQPage JSON-LD.

- [ ] **Step 1: 컴포넌트 작성**

`app/(public)/_components/faq.tsx` 생성:

```tsx
import { FAQ, type FaqCategory, type FaqItem } from '@/lib/faq/data';
import { faqSchema, JsonLd } from '@/lib/seo/json-ld';

/** JSON-LD 없이 아코디언만 렌더(통합 /faq 페이지에서 카테고리별 재사용). */
export function FaqList({
  items,
  title = '자주 묻는 질문',
}: {
  items: FaqItem[];
  title?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-5 text-xl font-bold text-[var(--color-blue-dark)]">{title}</h2>
      <div className="space-y-3">
        {items.map((it) => (
          <details
            key={it.q}
            className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-[var(--color-blue-dark)]">
              <span className="break-keep">{it.q}</span>
              <span
                aria-hidden
                className="shrink-0 text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-text)]">
              <p className="break-keep">{it.a}</p>
              {it.source ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">출처: {it.source}</p>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** 랜딩 페이지용: 카테고리 FAQ 아코디언 + FAQPage JSON-LD. */
export function Faq({ category, title }: { category: FaqCategory; title?: string }) {
  const items = FAQ[category];
  if (!items?.length) return null;
  return (
    <>
      <FaqList items={items} title={title} />
      <JsonLd data={faqSchema(items)} />
    </>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(컴포넌트가 Task 1·2 export와 타입 정합).

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/_components/faq.tsx
git commit -m "feat(faq): 재사용 FAQ 아코디언 컴포넌트 추가"
```

---

## Task 4: 통합 `/faq` 페이지 + 사이트맵

**Files:**
- Create: `app/(public)/faq/page.tsx`
- Modify: `lib/sitemap/static-entries.ts`

**Interfaces:**
- Consumes: `FAQ`, `FAQ_PAGE_ORDER`, `FAQ_CATEGORY_LABEL` (Task 2); `FaqList` (Task 3); `faqSchema`, `breadcrumbSchema`, `JsonLd` (Task 1/기존); `SITE_URL`(`@/lib/site`).

- [ ] **Step 1: 페이지 작성**

`app/(public)/faq/page.tsx` 생성:

```tsx
import type { Metadata } from 'next';
import { FAQ, FAQ_PAGE_ORDER, FAQ_CATEGORY_LABEL } from '@/lib/faq/data';
import { FaqList } from '../_components/faq';
import { faqSchema, breadcrumbSchema, JsonLd } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description:
    '임장ON 부동산 실거래가·청약·생활시설 정보 이용에 대해 자주 묻는 질문을 모았습니다. 공공데이터 기반 정보의 출처와 활용법을 안내합니다.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  const allItems = FAQ_PAGE_ORDER.flatMap((c) => FAQ[c]);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">자주 묻는 질문</h1>
      <p className="mt-3 break-keep text-[var(--color-muted)]">
        임장ON이 제공하는 부동산 실거래가와 생활시설 정보에 대해 자주 묻는 질문을 모았습니다.
      </p>

      {FAQ_PAGE_ORDER.map((c) => (
        <FaqList key={c} items={FAQ[c]} title={FAQ_CATEGORY_LABEL[c]} />
      ))}

      <JsonLd
        data={[
          faqSchema(allItems),
          breadcrumbSchema([
            { name: '홈', url: SITE_URL },
            { name: '자주 묻는 질문', url: `${SITE_URL}/faq` },
          ]),
        ]}
      />
    </article>
  );
}
```

- [ ] **Step 2: 사이트맵 엔트리 추가**

`lib/sitemap/static-entries.ts`의 `STATIC_ENTRIES` 배열에서 `/about` 등 정적 페이지 항목 근처에 추가:

```ts
{ url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.3 },
```

- [ ] **Step 3: 타입체크 + 빌드 라우트 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/faq/page.tsx lib/sitemap/static-entries.ts
git commit -m "feat(faq): 통합 /faq 페이지 + 사이트맵 등록"
```

---

## Task 5: Footer 링크

**Files:**
- Modify: `app/(public)/_components/footer.tsx`

- [ ] **Step 1: "법적 안내" 칼럼에 링크 추가**

`footer.tsx`의 "법적 안내" `<ul>`에서 "데이터 안내" 항목 다음 줄에 추가:

```tsx
<li><Link href="/faq">자주 묻는 질문</Link></li>
```

(삽입 위치 예시 — 기존 코드)
```tsx
            <li><Link href="/data-source">데이터 안내</Link></li>
            <li><Link href="/faq">자주 묻는 질문</Link></li>
            <li><Link href="/terms">이용약관</Link></li>
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/_components/footer.tsx
git commit -m "feat(faq): footer에 자주 묻는 질문 링크 추가"
```

---

## Task 6: 랜딩 페이지에 FAQ 통합

각 랜딩 페이지의 **최상위 컨테이너 닫는 태그 직전**(기존 마지막 자식, 보통 `<SourceCaption>` 다음)에 `<Faq category="..." />`를 삽입한다. 파일 상단 import 구역에 `import { Faq } from '../_components/faq';`(상대 깊이에 맞게)를 추가한다.

**파일 ↔ 카테고리 매핑:**

| 파일 | category | import 경로 |
|---|---|---|
| `app/(public)/apt/page.tsx` | `apt` | `../_components/faq` |
| `app/(public)/officetel/page.tsx` | `officetel` | `../_components/faq` |
| `app/(public)/villa/page.tsx` | `villa` | `../_components/faq` |
| `app/(public)/subscription/page.tsx` | `subscription` | `../_components/faq` |
| `app/(public)/finance/page.tsx` | `finance` | `../_components/faq` |
| `app/(public)/jeonse-guarantee/page.tsx` | `jeonse-guarantee` | `../_components/faq` |
| `app/(public)/school/page.tsx` | `school` | `../_components/faq` |
| `app/(public)/childcare/page.tsx` | `childcare` | `../_components/faq` |
| `app/(public)/life/page.tsx` | `life` | `../_components/faq` |
| `app/(public)/region/page.tsx` | `region` | `../_components/faq` |
| `app/(public)/medical/hospital/page.tsx` | `hospital` | `../../_components/faq` |
| `app/(public)/medical/pharmacy/page.tsx` | `pharmacy` | `../../_components/faq` |

- [ ] **Step 1: `/apt` 통합 (모범 예시)**

`app/(public)/apt/page.tsx`:
- import 추가: `import { Faq } from '../_components/faq';`
- `<SourceCaption ids={['molit-rtms']} />` 다음 줄, `</section>` 직전에 추가:

```tsx
      <SourceCaption ids={['molit-rtms']} />

      <Faq category="apt" />
    </section>
```

- [ ] **Step 2: 나머지 11개 파일 동일 패턴 적용**

위 매핑표대로 각 파일에 import 추가 후, 페이지 최상위 컨테이너 닫는 태그 직전에 해당 `<Faq category="..." />`를 삽입한다. 각 파일을 열어 마지막 자식(SourceCaption 또는 마지막 섹션) 다음에 배치한다.

- `medical/hospital/page.tsx`, `medical/pharmacy/page.tsx`는 한 단계 더 깊으므로 import 경로가 `../../_components/faq`임에 주의.

- [ ] **Step 3: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(모든 category 리터럴이 `FaqCategory`와 정합).

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)
git commit -m "feat(faq): 랜딩 페이지 12곳에 카테고리 FAQ 섹션 통합"
```

---

## Task 7: 전체 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 단위 테스트 전체 통과**

Run: `pnpm exec vitest run tests/lib/faq.test.ts tests/lib/json-ld.test.ts`
Expected: 모두 PASS.

- [ ] **Step 2: 린트 + 타입체크**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 개발 서버 수동 확인**

Run: `pnpm dev` (백그라운드) 후 브라우저로 확인:
- `/faq` — 12개 카테고리 섹션이 아코디언으로 렌더되고, 펼침/접힘이 키보드(Enter/Space)로 동작.
- `/apt` 하단에 "자주 묻는 질문" 섹션 노출.
- `/faq` 페이지 소스에 `"@type":"FAQPage"` JSON-LD가 1개만 존재.
- `/apt` 페이지 소스에 `"@type":"FAQPage"` JSON-LD 존재.
- footer "법적 안내"에 "자주 묻는 질문" 링크 동작.

- [ ] **Step 4: 빌드**

Run: `pnpm build`
Expected: `/faq` 라우트 포함, 빌드 성공.

---

## Self-Review

- **Spec coverage:** 데이터(Task 2)·faqSchema(Task 1)·재사용 컴포넌트(Task 3)·랜딩 통합(Task 6)·통합 /faq 페이지(Task 4)·footer(Task 5)·테스트(Task 1·2·7) — spec의 7개 구성 요소 모두 매핑됨. 깊은 상세 제외 제약은 Task 6 범위에서 명시(랜딩만).
- **Placeholder scan:** 모든 코드 스텝에 실제 코드·실제 FAQ 콘텐츠 포함, TBD 없음.
- **Type consistency:** `faqSchema(items: {q,a}[])` ↔ `FaqItem`(q,a,source) 호환, `FaqCategory` 리터럴이 데이터·컴포넌트·랜딩에서 일관, `FAQ`/`FAQ_PAGE_ORDER`/`FAQ_CATEGORY_LABEL` 이름 일관.
