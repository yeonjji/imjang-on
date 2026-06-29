# L9 — Subscription 산문 blurb (AdSense Phase A, 축소판) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 청약(subscription) 상세 페이지(약 5,780개)에 단지·지역·세대수·접수일정을 담은 **고유 산문 문단(blurb)** 을 추가해 "라벨-값만" 상태를 벗어난다 — 아파트(`propertyBlurb`)가 이미 하는 패턴을 청약에 이식.

**Architecture:** 새 순수 함수 `subscriptionBlurb()`를 `lib/seo/blurb.ts`에 추가(기존 `propertyBlurb`와 동일 스타일, `josa` 재사용, 새 데이터 의존 없음). `subscription/[id]/page.tsx`의 `SubscriptionHero` 아래에 villa와 동일한 스타일로 SSR 렌더한다.

**Tech Stack:** Next.js App Router 서버 컴포넌트(SSR — 별도 SSR 처리 불필요), vitest 순수 함수 단위 테스트(`tests/lib`, CI `test:unit`에 포함됨).

---

## File Structure

- **Modify:** `lib/seo/blurb.ts` — `SubscriptionBlurbInput` 인터페이스 + `subscriptionBlurb()` 함수 추가(파일 끝에).
- **Create:** `tests/lib/subscription-blurb.test.ts` — 조립·폴백 단위 테스트.
- **Modify:** `app/(public)/subscription/[id]/page.tsx` — import + Hero 아래 blurb 문단 렌더.

## 배경(엔지니어용)

- `lib/seo/blurb.ts`는 이미 `import { josa } from '@/lib/seo/josa';`를 갖고 있고, `josa(name, '은', '는')`는 **이름+조사**("힐스테이트는")를 반환한다(`propertyBlurb` 참고).
- `subscription/[id]/page.tsx`의 `notice` 객체 필드(이미 페이지에서 사용 중): `name: string`, `regionName: string | null`, `totalSupply: number | null`, `category`(→ `categoryLabel(notice.category)`로 라벨화, `categoryLabel`은 이미 `@/lib/subscription`에서 import됨), `receiptBegin: Date | null`, `receiptEnd: Date | null`.
- 테스트 러너 vitest, `globals: false`(→ `vitest`에서 import), alias `@`→root. `tests/lib`은 CI `test:unit`에 포함된다.

---

## Task 1: `subscriptionBlurb()` 순수 함수 (TDD)

**Files:**
- Create: `tests/lib/subscription-blurb.test.ts`
- Modify: `lib/seo/blurb.ts`

- [ ] **Step 1: 실패 테스트 작성** — `tests/lib/subscription-blurb.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subscriptionBlurb } from '@/lib/seo/blurb';

describe('subscriptionBlurb', () => {
  it('지역·세대수·접수일정을 한 문단으로 조립한다', () => {
    const text = subscriptionBlurb({
      name: '힐스테이트 강남',
      regionName: '서울 강남구',
      categoryLabel: '민영',
      totalSupply: 1200,
      receiptBegin: new Date('2026-07-01'),
      receiptEnd: new Date('2026-07-03'),
    });
    expect(text).toContain('힐스테이트 강남');
    expect(text).toContain('서울 강남구');
    expect(text).toContain('1,200세대');
    expect(text).toContain('2026.07.01~2026.07.03');
    expect(text).toContain('청약입니다');
  });

  it('데이터가 비면 우아하게 폴백한다(세대수 생략, 일정 안내문)', () => {
    const text = subscriptionBlurb({
      name: '무명단지',
      regionName: null,
      categoryLabel: '국민',
      totalSupply: null,
      receiptBegin: null,
      receiptEnd: null,
    });
    expect(text).toContain('공급되는');
    expect(text).toContain('접수 일정은 공고에서 확인하세요');
    expect(text).not.toContain('세대 규모');
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인** — `pnpm exec vitest run tests/lib/subscription-blurb.test.ts` → FAIL(`subscriptionBlurb` 미정의).

- [ ] **Step 3: 함수 구현** — `lib/seo/blurb.ts` 파일 끝에 추가:

```ts
export interface SubscriptionBlurbInput {
  name: string;
  regionName: string | null;
  categoryLabel: string;
  totalSupply: number | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
}

/** 청약 공고를 한 문단으로 요약. 데이터 누락 시 우아하게 생략·폴백한다. */
export function subscriptionBlurb(i: SubscriptionBlurbInput): string {
  const subject = josa(i.name, '은', '는');
  const where = i.regionName ? `${i.regionName}에서 공급되는` : '공급되는';
  const supply = i.totalSupply
    ? ` 총 ${i.totalSupply.toLocaleString('ko-KR')}세대 규모이며,`
    : '';
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '.');
  let schedule: string;
  if (i.receiptBegin && i.receiptEnd) {
    schedule = ` 청약 접수는 ${fmt(i.receiptBegin)}~${fmt(i.receiptEnd)}입니다.`;
  } else if (i.receiptBegin) {
    schedule = ` 청약 접수는 ${fmt(i.receiptBegin)}부터입니다.`;
  } else {
    schedule = ' 접수 일정은 공고에서 확인하세요.';
  }
  return `${subject} ${where} ${i.categoryLabel} 청약입니다.${supply}${schedule} 주변 단지 실거래가와 생활 인프라를 함께 확인하세요.`;
}
```

(`josa`는 이 파일에 이미 import돼 있음 — 추가 import 불필요. 새 import 추가하지 말 것.)

- [ ] **Step 4: 실행 → 통과 확인** — `pnpm exec vitest run tests/lib/subscription-blurb.test.ts` → PASS.

- [ ] **Step 5: 타입체크** — `pnpm typecheck` → 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add lib/seo/blurb.ts tests/lib/subscription-blurb.test.ts
git commit -m "feat(seo): subscriptionBlurb() — 청약 산문 요약 생성 (L9)"
```

## Task 2: subscription 상세에 blurb 렌더

**Files:**
- Modify: `app/(public)/subscription/[id]/page.tsx`

- [ ] **Step 1: import 추가** — 기존 `import { ... } from '@/lib/seo/json-ld';` 부근(상단 import 블록)에 추가:

```ts
import { subscriptionBlurb } from '@/lib/seo/blurb';
```

- [ ] **Step 2: Hero 아래 blurb 문단 렌더** — `<SubscriptionHero notice={notice} />` 바로 다음 줄에 삽입(villa 페이지와 동일 스타일):

```tsx
      <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-5 py-4 leading-relaxed text-[var(--color-text)]">
        {subscriptionBlurb({
          name: notice.name,
          regionName: notice.regionName,
          categoryLabel: categoryLabel(notice.category),
          totalSupply: notice.totalSupply,
          receiptBegin: notice.receiptBegin,
          receiptEnd: notice.receiptEnd,
        })}
      </p>
```

(`categoryLabel`은 이 파일에 이미 import돼 있음.)

- [ ] **Step 3: 타입체크** — `pnpm typecheck` → 에러 없음(필드 타입이 `subscriptionBlurb` 시그니처와 일치하는지 컴파일러가 확인).

- [ ] **Step 4: 단위 스위트 회귀 확인** — `pnpm exec vitest run tests/lib/subscription-blurb.test.ts` → PASS(여전히 통과).

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/subscription/[id]/page.tsx"
git commit -m "feat(seo): 청약 상세에 산문 blurb 렌더 (L9)"
```

## Verification (스펙 §7 "subscription 산문" 지표)

배포 후: `curl -sL https://imjangon.co.kr/subscription/<id>` 의 raw HTML에 blurb 문장(예: "청약입니다")이 Hero 아래에 존재.

## Out of scope
- coord-null 같은지역 청약 링크(사이드바·"위치정보없음" 박스·브리핑이 이미 dead-end 방지) · villa/finance/jeonse(재스코프 결과 이미 적정) · L8(POI blurb) · L3/L4/L7.
