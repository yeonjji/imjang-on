# 통합검색 → 실거래가 목록 진입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통합검색창(히어로·네비)에서 검색하면 검색어를 포함한 실거래가 목록(`/list`)으로 진입하게 한다.

**Architecture:** `getPropertyList`에 `q` 키워드 필터를 추가하되, 순수 헬퍼 `buildKeywordCondition(q)`로 분리해 Prisma `where` 조각을 만들고(단지명 `nameNorm` OR 지역명 `region.fullName` 부분일치), `where.AND`에 결합한다. 검색창 두 곳의 제출·드롭다운 라우팅을 `/list`로 바꾸고, 더 이상 쓰이지 않는 `/search` 페이지를 삭제한다.

**Tech Stack:** Next.js (App Router, RSC), Prisma, TypeScript, Vitest, pnpm.

---

## 파일 구조

- `lib/property.ts` — `buildKeywordCondition` 헬퍼 추가, `PropertyListParams`·`getPropertyList`에 `q` 배선. (기존 `buildPriceCondition`와 동일한 "순수 함수로 분리 → 테스트" 패턴)
- `tests/lib/property-keyword-filter.test.ts` — `buildKeywordCondition` 단위 테스트 (신규).
- `app/(public)/list/_components/property-list.tsx` — `q` prop 전달.
- `app/(public)/list/page.tsx` — `q` searchParam 수신·전달, 헤더에 검색어 노출.
- `app/(public)/_components/hero-search.tsx` — 제출·드롭다운 라우팅 `/list`로.
- `app/(public)/_components/search-input.tsx` — `useRouter`·Enter 핸들러 추가, 드롭다운 라우팅 `/list`로.
- `app/(public)/search/page.tsx` — 삭제.
- `app/robots.ts` — disallow에서 `/search` 제거.

검증 명령:
- 타입체크: `pnpm typecheck`
- 단일 테스트: `pnpm exec vitest run tests/lib/property-keyword-filter.test.ts`
- 단위 스위트: `pnpm test:unit`

---

### Task 1: `buildKeywordCondition` 순수 헬퍼 (TDD)

**Files:**
- Test: `tests/lib/property-keyword-filter.test.ts` (create)
- Modify: `lib/property.ts` (import 추가 + 헬퍼 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/property-keyword-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildKeywordCondition } from '@/lib/property';

describe('buildKeywordCondition', () => {
  it('q 미지정/공백이면 undefined', () => {
    expect(buildKeywordCondition(undefined)).toBeUndefined();
    expect(buildKeywordCondition('')).toBeUndefined();
    expect(buildKeywordCondition('   ')).toBeUndefined();
  });

  it('단지명(정규화) OR 지역명(원문) 부분일치 조건 반환', () => {
    expect(buildKeywordCondition('래미안 ')).toEqual({
      OR: [
        { nameNorm: { contains: '래미안' } },
        { region: { is: { fullName: { contains: '래미안' } } } },
      ],
    });
  });

  it('공백·기호가 섞인 단지명은 nameNorm 매칭용으로 정규화된다', () => {
    expect(buildKeywordCondition('강남 자이')).toEqual({
      OR: [
        { nameNorm: { contains: '강남자이' } },
        { region: { is: { fullName: { contains: '강남 자이' } } } },
      ],
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/property-keyword-filter.test.ts`
Expected: FAIL — `buildKeywordCondition` is not exported / not a function.

- [ ] **Step 3: 최소 구현**

`lib/property.ts` 상단 import 블록(현재 1–3행)에 `normalizeName` import 추가:

```ts
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { normalizeName } from '@/lib/slug';
```

`buildPriceCondition` 함수 정의 바로 아래(현재 58행 닫는 `}` 다음 줄)에 헬퍼 추가:

```ts
export function buildKeywordCondition(
  q: string | undefined,
): Prisma.PropertyWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  return {
    OR: [
      { nameNorm: { contains: normalizeName(term) } },
      { region: { is: { fullName: { contains: term } } } },
    ],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/property-keyword-filter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts tests/lib/property-keyword-filter.test.ts
git commit -m "feat(property): add buildKeywordCondition for list keyword filter"
```

---

### Task 2: `getPropertyList`에 `q` 배선

**Files:**
- Modify: `lib/property.ts` (`PropertyListParams`, `getPropertyList`)

- [ ] **Step 1: 파라미터 타입에 `q` 추가**

`PropertyListParams` 인터페이스(현재 `sido?: string;` 아래)에 추가:

```ts
  sido?: string;
  q?: string;
  page?: number;
```

- [ ] **Step 2: `getPropertyList` 시그니처 구조분해에 `q` 추가**

`getPropertyList`의 구조분해(현재 `sido,` 다음 줄)에 `q,` 추가:

```ts
  sigunguCode,
  sido,
  q,
  page = 1,
```

- [ ] **Step 3: where에 키워드 조건 결합**

`areaRange` 처리 블록이 끝난 직후(`// deal + sort → orderBy` 주석 바로 위)에 추가:

```ts
  const keywordCond = buildKeywordCondition(q);
  if (keywordCond) {
    where.AND = [keywordCond];
  }
```

> 참고: 키워드는 `where.AND`에 넣으므로, deal=all + 가격 조건이 쓰는 `where.OR`와 충돌하지 않는다 (Prisma는 최상위 `OR`/`AND` 키를 서로 AND로 결합). `txCount12m > 0` 등 기존 deal 조건도 그대로 유지된다.

- [ ] **Step 4: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts
git commit -m "feat(property): wire q keyword filter into getPropertyList"
```

---

### Task 3: 목록 페이지·컴포넌트에 `q` 전달 + 헤더 노출

**Files:**
- Modify: `app/(public)/list/_components/property-list.tsx`
- Modify: `app/(public)/list/page.tsx`

- [ ] **Step 1: `PropertyList`가 `q`를 받아 전달**

`property-list.tsx`의 `Props`에 `q?` 추가 (현재 `sido?: string;` 다음):

```ts
  sigunguCode?: string;
  sido?: string;
  q?: string;
  page: number;
```

구조분해(현재 `sido,` 다음)에 `q,` 추가:

```ts
  sigunguCode,
  sido,
  q,
  page,
}: Props) {
```

`getPropertyList` 호출 인자(현재 `sido,` 다음)에 `q,` 추가:

```ts
    sigunguCode,
    sido,
    q,
    page,
    perPage: 30,
```

- [ ] **Step 2: 페이지 SearchParams에 `q` 추가**

`page.tsx`의 `interface SearchParams`(현재 `sido?: string;` 다음)에 추가:

```ts
  region?: string;
  sido?: string;
  q?: string;
  page?: string;
```

- [ ] **Step 3: `q` 파싱 + 컴포넌트 전달**

`page.tsx`의 `const page = ...` 줄 다음에 추가:

```ts
  const page = Math.max(1, Number(sp.page ?? '1'));
  const q = sp.q?.trim() || undefined;
```

`<PropertyList ... />` 인자(현재 `sido={sp.sido}` 다음)에 추가:

```tsx
              sigunguCode={sp.region}
              sido={sp.sido}
              q={q}
              page={page}
```

- [ ] **Step 4: 헤더에 검색어 노출**

`page.tsx`의 헤더 카드 부제 문단(현재 `<p className="mt-2 text-sm text-[var(--color-muted)]"> 아파트, 오피스텔, 다세대의 매매·전세·월세 실거래가를 한 번에 확인하세요. </p>`)을 조건부로 교체:

```tsx
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {q
            ? `“${q}” 검색 결과`
            : '아파트, 오피스텔, 다세대의 매매·전세·월세 실거래가를 한 번에 확인하세요.'}
        </p>
```

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/list/page.tsx" "app/(public)/list/_components/property-list.tsx"
git commit -m "feat(list): accept q search param and show it in header"
```

---

### Task 4: 히어로 검색창 라우팅 변경

**Files:**
- Modify: `app/(public)/_components/hero-search.tsx`

- [ ] **Step 1: 제출 라우팅을 `/list`로 변경**

`submit()` 내부(현재 45행) 교체:

```ts
    if (term) router.push(`/list?q=${encodeURIComponent(term)}`);
```

- [ ] **Step 2: 단지 드롭다운 항목을 목록으로**

단지 `Link`의 `href={typeToHref(p.type, p.id)}`(현재 75행)를 교체:

```tsx
                <Link key={p.id} href={`/list?q=${encodeURIComponent(p.name)}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
```

- [ ] **Step 3: 지역 드롭다운 항목을 목록으로**

지역 `Link`의 `href={`/region/${r.code.slice(0, 5)}`}`(현재 86행)를 교체:

```tsx
                <Link key={r.code} href={`/list?region=${r.code.slice(0, 5)}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
```

- [ ] **Step 4: 미사용 `typeToHref` 제거**

`typeToHref` 함수(현재 13–17행 모듈 상단 정의)가 더 이상 참조되지 않으므로 삭제한다. (이 변경으로 생긴 고아 함수 정리)

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (no "declared but never used").

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/_components/hero-search.tsx"
git commit -m "feat(search): route hero search and dropdown to /list"
```

---

### Task 5: 네비 검색창 라우팅 변경 (Enter + 드롭다운)

**Files:**
- Modify: `app/(public)/_components/search-input.tsx`

- [ ] **Step 1: `useRouter` import 및 인스턴스 추가**

import(현재 3행 `import { useState, useEffect, useRef } from 'react';`) 다음 줄에 추가:

```ts
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
```

`export function SearchInput() {` 본문 첫 줄(현재 `const [q, setQ] = useState('');` 위)에 추가:

```ts
export function SearchInput() {
  const router = useRouter();
  const [q, setQ] = useState('');
```

- [ ] **Step 2: Enter 제출 핸들러 추가**

`<Input ... />`(현재 49–55행)에 `onKeyDown` 추가:

```tsx
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const term = q.trim();
              if (term) { setOpen(false); router.push(`/list?q=${encodeURIComponent(term)}`); }
            }
          }}
          placeholder="단지/지역명 검색"
          className="pl-8"
        />
```

- [ ] **Step 3: 단지 드롭다운 항목을 목록으로**

단지 `Link`의 `href={typeToHref(p.type, p.id)}`(현재 65행)를 교체:

```tsx
                  href={`/list?q=${encodeURIComponent(p.name)}`}
```

- [ ] **Step 4: 지역 드롭다운 항목을 목록으로**

지역 `Link`의 `href={`/region/${r.code.slice(0, 5)}`}`(현재 81행)를 교체:

```tsx
                  href={`/list?region=${r.code.slice(0, 5)}`}
```

- [ ] **Step 5: 미사용 `typeToHref` 제거**

컴포넌트 내부 `typeToHref` 함수(현재 39–43행)가 더 이상 참조되지 않으므로 삭제한다.

- [ ] **Step 6: 타입체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add "app/(public)/_components/search-input.tsx"
git commit -m "feat(search): route nav search Enter and dropdown to /list"
```

---

### Task 6: `/search` 페이지 삭제 + robots 정리

**Files:**
- Delete: `app/(public)/search/page.tsx` (및 빈 `app/(public)/search/` 디렉터리)
- Modify: `app/robots.ts`

> 주의: `lib/search.ts`(autocomplete)와 `app/api/search/route.ts`는 드롭다운이 사용하므로 **삭제하지 않는다**. 삭제 대상은 페이지 라우트뿐이다.

- [ ] **Step 1: 페이지 삭제**

```bash
git rm "app/(public)/search/page.tsx"
rmdir "app/(public)/search" 2>/dev/null || true
```

- [ ] **Step 2: robots.ts에서 `/search` 제거**

`app/robots.ts`의 두 disallow 배열(현재 11행·16행)에서 `'/search', `를 제거:

```ts
        disallow: ['/list', '/api/', '/admin'],
```

(두 곳 모두 동일하게 수정)

- [ ] **Step 3: `/search` 잔존 참조 없음 확인**

Run: `grep -rn "'/search'\|\"/search\"\|\`/search\|/search?q=" app components lib | grep -v "/api/search"`
Expected: 결과 없음 (출력 없음).

- [ ] **Step 4: 타입체크 + 빌드 대상 확인**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "app/robots.ts"
git commit -m "chore(search): remove unused /search page and robots entry"
```

---

### Task 7: 전체 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 단위 테스트 스위트**

Run: `pnpm test:unit`
Expected: PASS (신규 `property-keyword-filter.test.ts` 포함 전체 통과).

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: 수동 확인 (선택, dev 서버)**

Run: `pnpm dev` 후 브라우저에서:
- 홈 히어로 검색창에 단지명 입력 → Enter → `/list?q=...` 진입, 헤더에 `“…” 검색 결과`, 결과 목록 노출.
- 네비 검색창에 Enter → 동일 동작.
- 드롭다운 단지 클릭 → `/list?q=<단지명>`, 지역 클릭 → `/list?region=<코드>`.

---

## Self-Review

**Spec coverage:**
- 매칭 단지명+지역명 → Task 1 (`buildKeywordCondition`의 OR). ✓
- 검색창 둘 다 → Task 4(히어로) + Task 5(네비). ✓
- 드롭다운 모두 목록으로 (단지→q, 지역→region) → Task 4/5. ✓
- 목록에 키워드 필터 추가 → Task 1+2. ✓
- 헤더에 검색어 노출 → Task 3 Step 4. ✓
- `/search` 삭제 + robots 정리 → Task 6. ✓
- `tsc` + 단위 테스트 검증 → Task 7. ✓

**Placeholder scan:** 모든 코드 블록은 실제 내용 포함, TBD/TODO 없음. ✓

**Type consistency:** `buildKeywordCondition(q: string | undefined): Prisma.PropertyWhereInput | undefined`를 Task 1에서 정의하고 Task 2에서 동일 시그니처로 호출. `q` 이름은 `PropertyListParams`·`PropertyList` Props·`SearchParams` 전반에서 일관. ✓
