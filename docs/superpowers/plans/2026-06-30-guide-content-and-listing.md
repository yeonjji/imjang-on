# 가이드 콘텐츠 채우기 + 목록 섹션화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/guide`(상록 가이드) 글을 독자 친화 구조로 14편 채우고, 목록을 분야별 섹션으로 구획하며, 네비게이션에서 가이드를 편집물 묶음(브리핑 옆) 끝으로 옮긴다.

**Architecture:** 기존 가이드 생성 파이프라인(`lib/guide/*` + `scripts/generate-guides.ts`)을 재사용한다. 생성 프롬프트를 9단 의도 구조로 업그레이드하고, 시드에 CTA 내부 링크 필드를 추가해 14편으로 확장한다. 목록 페이지는 순수 그룹핑 함수로 카테고리 섹션을 만든다. 상세 렌더링 계약(`## 핵심 요약` 콜아웃 분리)은 그대로 유지한다.

**Tech Stack:** Next.js(App Router) · TypeScript · Prisma · Vitest · OpenAI(생성)

## Global Constraints

- 상세 페이지가 `splitSummary()`로 본문에서 `## 핵심 요약` 블록을 떼어내 콜아웃으로 렌더한다. **생성 본문은 반드시 `## 핵심 요약`으로 시작**한다.
- 출처는 `PostSource`가 `sourceName/sourceUrl/sourceDate`로 렌더한다(본문 `## 참고 자료`는 텍스트 출처 표기용).
- 금지 규칙 유지: 시세 단정 전망·매수/매도 권유·과장 표현·근거 외 수치 날조 금지.
- 분량: 공백 제외 한글 1,000~6,000자(가드레일 하한 800).
- CTA 내부 링크는 실재 라우트만 사용: `/list`, `/subscription`, `/jeonse-guarantee`, `/finance`, `/medical/hospital`, `/medical/pharmacy`, `/childcare`, `/school`, `/life`.
- 디자인 토큰만 사용(`var(--color-*)`, `var(--shadow-soft)`), 기존 컴포넌트 스타일 일치.
- 브리핑(`/board`)·기존 board 코드는 건드리지 않는다.

---

### Task 1: 네비게이션 순서 변경 (가이드 → 편집물 끝)

데스크톱·모바일 모두 `실거래가 · 청약 · 금융 · 생활 · 가이드 · 브리핑` 순서로 맞춘다.

**Files:**
- Modify: `app/(public)/_components/nav.tsx:33-40`
- Modify: `app/(public)/_components/mobile-drawer.tsx:18-23`, `app/(public)/_components/mobile-drawer.tsx:163-173`

**Interfaces:**
- Consumes: 없음
- Produces: 없음(시각 변경)

- [ ] **Step 1: 데스크톱 nav 순서 변경**

`app/(public)/_components/nav.tsx`의 링크 묶음에서 `<Link href="/guide">가이드</Link>`를 `LifeDropdown` 뒤(브리핑 앞)로 옮긴다.

```tsx
          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/list">실거래가</Link>
            <Link href="/subscription">청약</Link>
            <FinanceDropdown />
            <LifeDropdown onSoon={(topic) => setSoonOpen(topic)} />
            <Link href="/guide">가이드</Link>
            {isBoardPublic() && <Link href="/board">임장ON 브리핑</Link>}
          </div>
```

- [ ] **Step 2: 모바일 드로어 상단 links에서 가이드 제거**

`app/(public)/_components/mobile-drawer.tsx`의 `links` 배열에서 가이드 항목을 뺀다.

```tsx
const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/subscription', label: '청약' },
];
```

- [ ] **Step 3: 모바일 드로어 생활편의 뒤·브리핑 앞에 가이드 링크 추가**

`mobile-drawer.tsx`에서 `lifeOpen` 블록이 끝난 직후(브리핑 `isBoardPublic()` 블록 바로 위)에 추가한다.

```tsx
        <Link
          href="/guide"
          onClick={onClose}
          className="rounded-lg px-2 py-3 text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          가이드
        </Link>

        {isBoardPublic() && (
          <Link
            href="/board"
            onClick={onClose}
            className="rounded-lg px-2 py-3 text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
          >
            임장ON 브리핑
          </Link>
        )}
```

- [ ] **Step 4: 타입체크 + 수동 확인**

Run: `pnpm exec tsc --noEmit`
Expected: `TSC OK` (에러 없음). 데스크톱·모바일에서 순서가 `… 생활 · 가이드 · 브리핑`인지 육안 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/(public)/_components/nav.tsx app/(public)/_components/mobile-drawer.tsx
git commit -m "feat(guide): 나브에서 가이드를 편집물(브리핑) 옆 끝으로 이동"
```

---

### Task 2: 시드에 CTA 링크 필드 추가 + 14편으로 확장

`GuideSeed`에 `related: { label, href }`를 추가하고, 기존 7개를 채운 뒤 신규 7개(카테고리당 2편)를 더한다.

**Files:**
- Modify: `lib/guide/seeds.ts`
- Test: `tests/lib/guide-seeds.test.ts`

**Interfaces:**
- Produces: `GuideSeed.related: { label: string; href: string }` — Task 3(생성 입력)·Task 5(생성 실행)가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/guide-seeds.test.ts`의 `describe` 안에 추가한다.

```ts
  it('각 시드는 내부 링크 CTA(related)를 갖는다', () => {
    for (const s of GUIDE_SEEDS) {
      expect(s.related.label.length).toBeGreaterThan(0);
      expect(s.related.href.startsWith('/')).toBe(true);
    }
  });
  it('카테고리당 정확히 2편이다(총 14편)', () => {
    const byCat = new Map<string, number>();
    for (const s of GUIDE_SEEDS) byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1);
    for (const n of byCat.values()) expect(n).toBe(2);
    expect(GUIDE_SEEDS.length).toBe(14);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/guide-seeds.test.ts`
Expected: FAIL (`related` 프로퍼티 없음 / 길이 7).

- [ ] **Step 3: 인터페이스에 related 추가**

`lib/guide/seeds.ts`의 `GuideSeed`에 필드 추가.

```ts
export interface GuideSeed {
  key: string;
  category: GuideCategory;
  title: string;
  angle: string;
  source: { name: string; url: string; date: string; excerpt: string };
  related: { label: string; href: string }; // 마무리 '더 알아보기' CTA 내부 링크
}
```

- [ ] **Step 4: 기존 7개 시드에 related 채우기**

각 기존 시드 객체에 `related`를 추가한다.

```ts
// medical-night-holiday-pharmacy
related: { label: '약국 찾기', href: '/medical/pharmacy' },
// childcare-types-and-choosing
related: { label: '어린이집 찾기', href: '/childcare' },
// school-district-assignment
related: { label: '학교 정보 보기', href: '/school' },
// realestate-read-transaction-price
related: { label: '실거래가 조회하기', href: '/list' },
// subscription-eligibility-points
related: { label: '청약 일정 보기', href: '/subscription' },
// finance-jeonse-guarantee-limit
related: { label: '전세자금보증 추천 보기', href: '/jeonse-guarantee' },
// life-subway-access
related: { label: '생활 인프라 보기', href: '/life' },
```

- [ ] **Step 5: 신규 7개 시드 추가(카테고리당 2편째)**

`GUIDE_SEEDS` 배열 끝에 추가한다.

```ts
  {
    key: 'realestate-area-pyeong-explained',
    category: GuideCategory.REALESTATE,
    title: '전용·공급면적과 평수 계산 이해하기',
    angle: '전용면적·공급면적·계약면적의 차이와 ㎡↔평 환산의 일반 원리를 설명한다.',
    source: { name: '국토교통부 실거래가 공개시스템', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '실거래 신고에 전용면적이 표기된다.' },
    related: { label: '실거래가 조회하기', href: '/list' },
  },
  {
    key: 'subscription-account-types-rank',
    category: GuideCategory.SUBSCRIPTION,
    title: '청약통장 종류와 1순위 조건 이해하기',
    angle: '주택청약종합저축 등 청약통장의 종류와 1순위 요건(가입기간·납입)의 일반 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '청약통장 종류·1순위 요건 안내.' },
    related: { label: '청약 일정 보기', href: '/subscription' },
  },
  {
    key: 'finance-policy-housing-loans',
    category: GuideCategory.FINANCE,
    title: '디딤돌·보금자리 등 정책대출 한눈에 보기',
    angle: '내집마련 디딤돌대출·보금자리론 등 정책 모기지의 일반 목적과 자격 구조를 설명한다.',
    source: { name: '주택도시기금', url: 'https://nhuf.molit.go.kr', date: '2026-01-01', excerpt: '디딤돌대출 등 정책대출 상품 안내.' },
    related: { label: '정책대출 상품 보기', href: '/finance' },
  },
  {
    key: 'medical-find-hospital-by-specialty',
    category: GuideCategory.MEDICAL,
    title: '동네 병원과 전문과목 찾는 법',
    angle: '진료과목·운영시간 등으로 가까운 병원을 찾는 공식 경로와 확인 절차를 설명한다.',
    source: { name: '건강보험심사평가원', url: 'https://www.hira.or.kr', date: '2026-01-01', excerpt: '병원·약국 진료과목·운영 정보 공개.' },
    related: { label: '병원 찾기', href: '/medical/hospital' },
  },
  {
    key: 'childcare-admission-waiting-process',
    category: GuideCategory.CHILDCARE,
    title: '어린이집 입소 대기와 신청 절차',
    angle: '입소 대기 신청·우선순위·대기 순번 확인의 일반 절차를 설명한다.',
    source: { name: '아이사랑보육포털', url: 'https://www.childcare.go.kr', date: '2026-01-01', excerpt: '어린이집 입소 대기 신청·관리 안내.' },
    related: { label: '어린이집 찾기', href: '/childcare' },
  },
  {
    key: 'school-schoolinfo-howto',
    category: GuideCategory.SCHOOL,
    title: '학교알리미로 학교 정보 확인하는 법',
    angle: '학교알리미에서 학교 현황·학급수·학생수 등 공개 정보를 확인하는 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 현황·공시 정보 공개.' },
    related: { label: '학교 정보 보기', href: '/school' },
  },
  {
    key: 'life-infra-checklist',
    category: GuideCategory.LIFE,
    title: '생활 인프라, 무엇을 따져봐야 할까',
    angle: '마트·공원·주차 등 생활 인프라를 살펴볼 때 고려하는 일반 기준을 설명한다.',
    source: { name: '공공데이터포털', url: 'https://www.data.go.kr', date: '2026-01-01', excerpt: '생활편의시설 위치·현황 공공데이터 제공.' },
    related: { label: '생활 인프라 보기', href: '/life' },
  },
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/guide-seeds.test.ts`
Expected: PASS (4 tests). `validateGuideSeeds`도 통과(키 고유·전 카테고리 커버).

- [ ] **Step 7: 커밋**

```bash
git add lib/guide/seeds.ts tests/lib/guide-seeds.test.ts
git commit -m "feat(guide): 시드에 CTA 링크 추가 + 카테고리당 2편(총 14편)으로 확장"
```

---

### Task 3: 생성 프롬프트 9단 구조 업그레이드 + CTA 링크 주입

`SYSTEM_PROMPT`을 독자 친화 구조로 교체하고, 생성 입력에 `relatedLabel`/`relatedHref`를 받아 마무리 CTA로 주입한다.

**Files:**
- Modify: `lib/guide/generate.ts`
- Modify: `scripts/generate-guides.ts:25-28`
- Test: `tests/lib/guide-generate.test.ts`

**Interfaces:**
- Consumes: `GuideSeed.related`(Task 2).
- Produces: `GenerateGuideInput`에 `relatedLabel: string; relatedHref: string` 필드 추가. 생성 본문은 `## 핵심 요약`으로 시작하고 `## 자주 묻는 질문`·`## 더 알아보기`·`## 참고 자료` 앵커를 포함.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/guide-generate.test.ts`의 `input`에 related 필드를 추가하고, 사용자 프롬프트에 CTA 링크가 들어가는지 검증하는 테스트를 추가한다. 먼저 `input`을 교체한다.

```ts
const input = {
  category: GuideCategory.REALESTATE,
  topic: '실거래가, 어떻게 읽어야 할까',
  angle: '실거래가의 의미와 호가와의 차이를 설명한다.',
  sourceText: '국토부 실거래가 공개시스템 안내문 원문',
  sourceName: '국토교통부 실거래가 공개시스템',
  relatedLabel: '실거래가 조회하기',
  relatedHref: '/list',
};
```

그리고 `describe` 안에 CTA 주입 검증 테스트를 추가한다.

```ts
  it('사용자 프롬프트에 마무리 CTA 링크를 그대로 주입한다', async () => {
    let captured = '';
    const spy: OpenAiLike = {
      chat: { completions: { create: async (args: { messages: { role: string; content: string }[] }) => {
        captured = args.messages.map((m) => m.content).join('\n');
        return { choices: [{ message: { content: JSON.stringify({ title: 't', summary: 's', body: 'b' }) } }] };
      } } },
    };
    await generateGuideDraft(spy, input, 'm');
    expect(captured).toContain('[실거래가 조회하기](/list)');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/guide-generate.test.ts`
Expected: FAIL (타입 에러: `relatedLabel`/`relatedHref`가 `GenerateGuideInput`에 없음; CTA 미포함).

- [ ] **Step 3: GenerateGuideInput 확장 + SYSTEM_PROMPT 교체**

`lib/guide/generate.ts`에서 인터페이스와 시스템 프롬프트를 교체한다.

```ts
export interface GenerateGuideInput {
  category: GuideCategory;
  topic: string;
  angle: string;
  sourceText: string;
  sourceName: string;
  relatedLabel: string;
  relatedHref: string;
}
```

```ts
export const SYSTEM_PROMPT = `당신은 공공데이터를 바탕으로 부동산·생활 정보를 쉽게 풀어 설명하는 한국어 가이드 작성자다.
독자가 끝까지 읽는 '상록(evergreen) 설명 글'을 쓴다. 특정 날짜의 뉴스가 아니라 언제 읽어도 유효한 개념·절차·유의점을 설명한다. 처음 접하는 일반 독자가 대상이다.

[허용 — 가이드 장르]
1. 개념 풀이, 단계별 방법(how-to), 일반적으로 알려진 유의점·비교를 문장으로 설명한다.

[금지 — 반드시 지킨다]
2. 집값·시세의 상승/하락 단정 전망을 쓰지 않는다("오를 것/내릴 것/급등/유망" 등 금지).
3. 매수·매도 권유나 투자 조언("지금이 기회/사두면/추천" 등)을 쓰지 않는다.
4. "무조건/보장/확실히 이득/최고의" 같은 과장 표현을 쓰지 않는다.
5. 제공된 근거 자료의 사실 범위를 벗어나는 구체 수치·고유 사실을 지어내지 않는다. 일반 원리는 풀어 쓰되 특정 수치는 자료에 있는 것만.
6. 특정 상품·기관을 추천하는 것처럼 쓰지 않는다. 행정·금융 용어는 문장 안에서 쉽게 풀어 설명한다.

[구조 — 이 골격을 지킨다. 고정 앵커 4개는 정확히 이 제목으로 쓴다]
7. 맨 위에 '## 핵심 요약' 섹션을 두고 요점을 3~4개 불릿(- )으로 정리한다. 각 불릿의 핵심어는 **굵게** 표시한다.
8. 이어지는 도입 문단에서 '이런 분께 필요한 정보'를 자연스럽게 한두 문장으로 녹인다(별도 소제목은 만들지 않는다).
9. 본문을 2~3개의 '## 소제목' 섹션으로 나눈다(개념 → 확인·이용 방법 → 유의점 흐름). 소제목 문구는 내용에 맞게 자유롭게 붙인다.
10. '## 자주 묻는 질문' 섹션에 질문 3~5개를 '**Q. 질문?** A. 답변' 형식으로 쓴다.
11. '## 더 알아보기' 섹션에 "조건은 달라질 수 있으니 공식 공고·자료를 함께 확인하는 것이 좋습니다" 취지의 안내 문장을 넣고, 이어서 'CTA_PLACEHOLDER'에 사용자 메시지로 제공되는 링크를 '관련 정보 확인하기 → [라벨](경로)' 형태로 그대로 넣는다.
12. 맨 끝에 '## 참고 자료' 섹션을 두고 출처와 기준을 한 줄로 밝힌다.
13. 광고성·과장 표현 없이 신뢰감 있는 정보 사이트 문체로, 문장은 짧고 명확하게 쓴다.

[분량] 공백 제외 한글 최소 1,000자. 내용이 풍부하면 더 길어도 좋다(최대 6,000자).
[출력] body는 마크다운. title은 25자 내외, summary는 한 문장 요약.`;
```

`buildUserPrompt`에 CTA 링크 줄을 추가한다.

```ts
function buildUserPrompt(input: GenerateGuideInput): string {
  return `주제: ${input.topic}\n서술 방향: ${input.angle}\n\n'## 더 알아보기' 섹션의 CTA 링크는 다음을 그대로 사용하라: 관련 정보 확인하기 → [${input.relatedLabel}](${input.relatedHref})\n\n다음은 '${input.sourceName}'의 근거 자료다. 이 자료의 사실 범위 안에서 일반 개념·절차를 풀어 설명하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}
```

- [ ] **Step 4: 생성 스크립트 호출부에 related 전달**

`scripts/generate-guides.ts`의 `generateGuideDraft` 호출 입력에 related를 추가한다.

```ts
      const llm = await generateGuideDraft(
        client,
        {
          category: seed.category,
          topic: seed.title,
          angle: seed.angle,
          sourceText: seed.source.excerpt,
          sourceName: seed.source.name,
          relatedLabel: seed.related.label,
          relatedHref: seed.related.href,
        },
        model,
      );
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/guide-generate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: 타입체크 + 가이드 테스트 전체**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/lib/guide-generate.test.ts tests/lib/guide-guardrails.test.ts tests/lib/guide-seeds.test.ts`
Expected: `TSC OK` + 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
git add lib/guide/generate.ts scripts/generate-guides.ts tests/lib/guide-generate.test.ts
git commit -m "feat(guide): 생성 프롬프트 9단 독자친화 구조 + 마무리 CTA 링크 주입"
```

---

### Task 4: 목록 페이지 카테고리 섹션화

전체 보기일 때 카테고리별 섹션 카드로 묶는다. 그룹핑은 순수 함수로 분리해 테스트한다.

**Files:**
- Create: `lib/guide/group.ts`
- Modify: `lib/guide/queries.ts`
- Modify: `app/(public)/guide/page.tsx`
- Test: `tests/lib/guide-group.test.ts`

**Interfaces:**
- Consumes: `GuideListItem`(`lib/guide/queries.ts`), `GUIDE_CATEGORIES`/`guideCategoryLabel`(`lib/guide/labels.ts`).
- Produces:
  - `groupGuidesByCategory(rows: GuideListItem[]): { category: GuideCategory; label: string; items: GuideListItem[] }[]` — `GUIDE_CATEGORIES` 순서, 항목 없는 카테고리는 제외.
  - `listAllPublishedGuides(): Promise<GuideListItem[]>` — 전체 PUBLISHED(상한 100) 최신순.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/guide-group.test.ts` 생성.

```ts
import { describe, it, expect } from 'vitest';
import { groupGuidesByCategory } from '@/lib/guide/group';
import { GuideCategory } from '@prisma/client';
import type { GuideListItem } from '@/lib/guide/queries';

function item(category: GuideCategory, slug: string): GuideListItem {
  return { id: 1n, slug, title: slug, summary: 's', category, publishedAt: new Date() };
}

describe('groupGuidesByCategory', () => {
  it('GUIDE_CATEGORIES 순서로 묶고, 항목 없는 카테고리는 제외한다', () => {
    const rows = [
      item(GuideCategory.LIFE, 'l1'),
      item(GuideCategory.REALESTATE, 'r1'),
      item(GuideCategory.REALESTATE, 'r2'),
    ];
    const groups = groupGuidesByCategory(rows);
    expect(groups.map((g) => g.category)).toEqual([GuideCategory.REALESTATE, GuideCategory.LIFE]);
    expect(groups[0].items.map((i) => i.slug)).toEqual(['r1', 'r2']);
    expect(groups[0].label).toBe('부동산');
  });
  it('빈 입력이면 빈 배열', () => {
    expect(groupGuidesByCategory([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/guide-group.test.ts`
Expected: FAIL (`@/lib/guide/group` 없음).

- [ ] **Step 3: 순수 그룹핑 함수 구현**

`lib/guide/group.ts` 생성.

```ts
import type { GuideCategory } from '@prisma/client';
import type { GuideListItem } from '@/lib/guide/queries';
import { GUIDE_CATEGORIES, guideCategoryLabel } from '@/lib/guide/labels';

export interface GuideCategorySection {
  category: GuideCategory;
  label: string;
  items: GuideListItem[];
}

/** GUIDE_CATEGORIES 순서로 묶는다. 항목 없는 카테고리는 제외(순수). */
export function groupGuidesByCategory(rows: GuideListItem[]): GuideCategorySection[] {
  return GUIDE_CATEGORIES.map(({ value }) => ({
    category: value,
    label: guideCategoryLabel(value),
    items: rows.filter((r) => r.category === value),
  })).filter((s) => s.items.length > 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/guide-group.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 전체 조회 쿼리 추가**

`lib/guide/queries.ts` 끝에 추가한다(`GuideListItem`/`prisma`는 이미 import됨).

```ts
/** 섹션 뷰용: 전체 PUBLISHED 가이드(상한 100, 최신순). */
export async function listAllPublishedGuides(): Promise<GuideListItem[]> {
  const rows = await prisma.guide.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, slug: true, title: true, summary: true, category: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
}
```

- [ ] **Step 6: 목록 페이지 섹션 분기 구현**

`app/(public)/guide/page.tsx`를 수정한다. import에 추가:

```tsx
import { listPublishedGuides, listAllPublishedGuides } from '@/lib/guide/queries';
import { groupGuidesByCategory } from '@/lib/guide/group';
```

본문에서 카테고리 필터가 없으면 섹션 뷰, 있으면 기존 그리드+페이지네이션을 렌더하도록 분기한다. 기존 `const { rows, totalPages } = await listPublishedGuides(...)` 블록부터 카드/페이지네이션 렌더까지를 아래로 교체한다(히어로 카드·칩 묶음은 그대로 둔다).

```tsx
  // 전체 보기: 카테고리 섹션. 특정 카테고리: 기존 그리드+페이지네이션.
  if (!category) {
    const all = await listAllPublishedGuides();
    const sections = groupGuidesByCategory(all);
    return (
      <div className="mx-auto max-w-[1180px] px-6 py-10">
        <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
          <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">가이드</p>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">생활·부동산 가이드</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">공공데이터를 토대로 개념·절차를 쉽게 풀어 설명합니다.</p>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <Link href={buildHref({})} className={chipClass(true)}>전체</Link>
          {GUIDE_CATEGORIES.map((c) => (
            <Link key={c.value} href={buildHref({ category: c.value })} className={chipClass(false)}>
              {c.label}
            </Link>
          ))}
        </div>

        {sections.length === 0 ? (
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
            아직 게시된 가이드가 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {sections.map((section) => (
              <section key={section.category}>
                <div className="mb-3 flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
                  <h2 className="text-lg font-black text-[var(--color-blue-dark)]">{section.label} 가이드</h2>
                  <Link href={buildHref({ category: section.category })} className="text-sm font-semibold text-[var(--color-blue)] hover:underline">
                    더보기
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.items.map((g) => (
                    <li key={g.slug} className="rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]">
                      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                        {guideCategoryLabel(g.category)}
                      </span>
                      <Link href={`/guide/${g.slug}`} className="mt-2 block text-lg font-bold text-[var(--color-blue-dark)] hover:underline">
                        {g.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{g.summary}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  const { rows, totalPages } = await listPublishedGuides({ page, category });

  return (
```

기존 반환 JSX(히어로+칩+그리드+페이지네이션)는 그대로 두되, 칩의 `chipClass(!category)`/`chipClass(category === c.value)`는 이 분기에선 항상 category가 있으므로 그대로 동작한다.

- [ ] **Step 7: 타입체크 + 테스트**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/lib/guide-group.test.ts`
Expected: `TSC OK` + PASS.

- [ ] **Step 8: 커밋**

```bash
git add lib/guide/group.ts lib/guide/queries.ts app/(public)/guide/page.tsx tests/lib/guide-group.test.ts
git commit -m "feat(guide): 목록 전체 보기를 카테고리별 섹션으로 구획"
```

---

### Task 5: 14편 생성·검수·게시 (운영 작업)

코드가 아니라 운영 실행 단계다. OPENAI 키와 DB 접근이 필요하다. `.env.local`은 운영 Supabase를 가리키므로 신중히 진행한다.

**Files:**
- 변경 없음(데이터 생성). 사용 스크립트: `scripts/generate-guides.ts`, `scripts/guide/restructure.ts`

**Interfaces:**
- Consumes: Task 2·3의 시드·프롬프트.

- [ ] **Step 1: 기존 7편 게시 여부 확인**

어드민(`/admin/guides`) 또는 DB에서 기존 7개 시드 키의 가이드가 이미 PUBLISHED인지 확인한다. 두 경로로 나뉜다:
- 미게시(없음/DRAFT): Step 2로 신규 생성.
- 이미 PUBLISHED(구 구조): Step 4의 `restructure.ts --in-place`로 본문만 새 구조 교체(게시일 리셋 방지).

- [ ] **Step 2: 신규 시드 DRAFT 생성**

신규 7개(또는 미존재분)는 dedupeKey 미존재라 생성된다. 키 단위로 안전하게:

Run(예): `pnpm exec dotenv -e .env.local -- tsx scripts/generate-guides.ts --only=realestate-area-pyeong-explained`
나머지 신규 키도 `--only=`로 하나씩 반복. 출력이 `created`인지 `rejected`(가드레일)인지 확인.

- [ ] **Step 3: 기존 7편을 새 구조로 교체(이미 PUBLISHED인 경우)**

먼저 dry-run으로 결과를 눈으로 본다.

Run: `pnpm exec dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 10 --dry-run`
이상 없으면 게시·게시일 유지하며 본문만 교체:
Run: `pnpm exec dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 10 --in-place`

(주의: `restructure.ts`는 board의 `restructureBody`를 쓰므로 FAQ/CTA 골격이 보장되지 않는다. 새 9단 구조를 확실히 적용하려면 기존편도 DRAFT 삭제 후 `generate-guides.ts`로 재생성하는 편이 일관적이다. 운영 데이터 삭제는 사용자 확인 후 진행한다.)

- [ ] **Step 4: 어드민 검수·게시**

`/admin/guides`에서 각 DRAFT의 가드레일 PASS·내용(핵심요약 시작·FAQ·CTA 링크·출처)을 확인하고 게시한다. 상세 페이지에서 `## 핵심 요약`이 하단 콜아웃으로 분리 렌더되는지, CTA 내부 링크가 올바른 라우트로 가는지 육안 확인.

- [ ] **Step 5: 목록 섹션 확인**

`/guide`(전체)에서 카테고리당 2편이 섹션으로 노출되는지, 칩 필터·"더보기"가 동작하는지 확인.

---

## Self-Review

**Spec coverage:**
- 나브 순서(작업1) → Task 1 ✅
- 프롬프트 업그레이드(작업2) → Task 3 ✅
- 시드 확장+related(작업3) → Task 2 ✅
- 목록 섹션화(작업4) → Task 4 ✅
- 14편 생성·검수·게시(작업5) → Task 5 ✅
- 렌더링 계약(`## 핵심 요약` 시작) → Task 3 프롬프트 고정 앵커 + Task 5 육안 확인 ✅
- 범위 밖(FAQ JSON-LD 추출 등)은 계획에 포함하지 않음 ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드/명령/기대 출력 포함. 신규 시드 7개는 구체 값으로 확정(스펙의 "예시"를 실제 키·출처·CTA로 고정).

**Type consistency:** `GuideSeed.related: { label; href }`(Task 2) → `GenerateGuideInput.relatedLabel/relatedHref`(Task 3) → `buildUserPrompt`에서 `[${relatedLabel}](${relatedHref})`로 사용. `GuideListItem`(queries) → `groupGuidesByCategory`(Task 4) → 페이지에서 `section.items` 사용. 일관됨.
