# 서민금융 대출상품 목록(`/finance`) 페이지네이션 설계

- **날짜:** 2026-07-03
- **대상 라우트:** `/finance` (서민금융 대출상품 목록)
- **상태:** 설계 확정 (사용자 승인 2026-07-03). §10 뒤로가기 동작 = **(가) `replaceState`** 확정.

## 1. 배경 / 문제

`/finance` 목록은 현재 **페이지네이션이 없어** 필터를 통과한 대출상품 카드를 전부 한 화면에 렌더한다.

- `app/(public)/finance/page.tsx` (서버 컴포넌트, `revalidate = 86_400`): `getLoanSummaries()`로 **전체 행을 로드**해 `<LoanExplorer rows={...} facets={...} />`에 넘긴다. LIMIT/OFFSET 없음.
- `app/(public)/finance/_components/loan-explorer.tsx` (`'use client'`): `filterLoans(rows, criteria)`를 `useMemo`로 계산한 `visible` 배열을 **전부** `visible.map(... <LoanCard>)`로 렌더한다 (78–80행).

현재 데이터 규모는 **318건**(`prisma.loanProduct.count()` 실측, 2026-07-03). 성능 위기는 아니지만 목록이 길고, 사이트의 다른 목록(청약 `/subscription`)은 번호 페이지네이션을 쓰므로 UX 일관성이 어긋난다.

### 목표 (사용자 확인: "전부 다")

1. **길이** — 한 화면에 보이는 카드 수를 줄여 브라우징을 정돈한다.
2. **성능/DOM** — 한 번에 렌더되는 카드 수를 줄여 DOM 부담을 낮춘다.
3. **일관성** — 청약(`/subscription`)과 동일한 페이지네이션 UI·URL(`?page=N`)을 쓴다.
4. **SEO** — 대출 상세 페이지 색인을 해치지 않는다.

### 비목표 (Non-goals)

- 필터·정렬 로직을 서버(SQL)로 이관하지 않는다. (현재 즉시 클라이언트 필터링 유지)
- `/subscription`이나 공용 `Pagination` 컴포넌트 자체를 리팩터하지 않는다.
- 무한 스크롤을 도입하지 않는다.
- ETL·데이터 모델(`LoanProduct`)·상세 페이지(`/finance/[seq]`)는 손대지 않는다.
- 새 테스트 프레임워크(jsdom/@testing-library) 도입은 범위 밖이다 (§8 참조).

## 2. 선택한 접근 — C. 하이브리드(클라이언트 필터 유지 + URL 기반 클라이언트 페이지네이션)

서버는 지금처럼 전체 318행을 로드해 넘기고, **클라이언트에서 필터된 `visible` 배열을 페이지 단위로 잘라(slice) 렌더**한다. 페이지 상태는 URL `?page=N`에 실어 공유·복원 가능하게 한다. 시각적 페이지네이션은 청약이 쓰는 공용 컴포넌트 `components/ui/pagination.tsx`를 **그대로 재사용**한다.

### 대안과 배제 근거

- **A. 무한 스크롤** — 청약과 UI 불일치(청약은 번호 페이지네이션), 푸터 도달·딥링크·스크롤 복원 문제. 목표 "일관성"과 충돌 → 배제.
- **B. 완전 서버사이드 페이지네이션(청약 구조 복제)** — 필터·정렬을 SQL로 이관해야 하고, 318건 규모에 과잉 설계이며 즉시 필터링 UX를 잃는다. 결정적으로 **서버에서 `searchParams`를 읽으면 라우트가 dynamic으로 바뀌어 `revalidate=86_400` ISR이 깨진다** → Supabase 디스크 IO 병목(과거 대응 이력) 재발 위험 → 배제.
- **C. 하이브리드 (채택)** — 네 목표를 모두 충족하면서 24h ISR을 유지하고 변경 범위가 가장 작다.

## 3. 핵심 제약 — 정적 ISR 유지 & 기존 URL 동기화 패턴

`loan-explorer.tsx`는 **이미 URL 동기화를 구현**하고 있으며, 15행 주석에 명시된 대로 **의도적으로 `useSearchParams`를 피하고 `window.location.search`(읽기) + `window.history.replaceState`(쓰기)를 쓴다.** 이유는 `useSearchParams`가 라우트를 dynamic으로 deopt시켜 `revalidate=86_400` 정적 캐시를 깨기 때문이다.

```js
// loan-explorer.tsx:15 (현재)
// URL searchParams ↔ criteria (정적 ISR 유지 위해 useSearchParams 대신 location 사용).
```

따라서 `page` 상태도 **동일한 패턴**을 따른다:

- 청약 래퍼 `subscription-pagination.tsx`의 `useRouter`/`useSearchParams`/`router.push` 메커니즘은 **쓰지 않는다.** (청약은 서버에서 searchParams를 읽는 dynamic 페이지라 무방하지만, 금융은 정적이어야 한다.)
- 청약과 공유하는 것은 **시각 컴포넌트 `components/ui/pagination.tsx`뿐**이다. UI·동작은 동일하되 URL 갱신은 `window.history` API로 한다.
- `page.tsx`(서버)는 **`searchParams`를 읽지 않는다.** 전체 행을 로드해 넘기는 현재 동작 그대로. `page`는 순수 클라이언트 뷰 상태다.

## 4. 상태 모델 & URL 계약

### 상태

- 기존 `criteria: LoanFilterCriteria` (usage/inst/target/region/query/sort) — 변경 없음.
- **신규 `page: number`** — `LoanExplorer`의 별도 `useState`. `criteria`에 합치지 않는다(`filterLoans`는 page를 쓰지 않고, page는 쓰기·리셋 시맨틱이 다르므로). URL 읽기/쓰기 시에만 함께 다룬다.
- 상수 `PER_PAGE = 20` (청약과 동일).

### 순수 헬퍼 `paginate` — 슬라이스·클램프 로직의 단일 출처

슬라이스와 클램프 규칙을 **컴포넌트에 인라인하지 않고** 순수 함수로 분리해 단위 테스트 가능하게 한다. 위치는 **`lib/pagination.ts`** (기존 `buildPager`와 동일 도메인, 이미 단위 테스트됨).

```ts
// lib/pagination.ts
export function paginate<T>(items: T[], page: number, perPage: number): {
  pageItems: T[];   // 현재 페이지 항목
  total: number;    // items.length
  totalPages: number; // max(1, ceil(total/perPage))
  safePage: number; // min(max(1, page), totalPages)  ← 클램프된 유효 페이지
}
```

컴포넌트는 이 반환값을 **렌더와 `<Pagination>` props 양쪽에** 그대로 쓴다. §4에 인라인 수식을 따로 두지 않는다(중복·발산 방지).

### URL 계약

- 필터 파라미터: `usage`, `inst`, `target`, `region`, `q`, `sort` — 기존 그대로.
- **`page`** 파라미터 추가. `safePage <= 1`이면 URL에서 **생략**(정규 URL 유지, `/finance`가 canonical).
- **URL에는 항상 클램프된 `safePage`를 쓴다** (raw `page`가 아님). 딥링크 `?page=99`가 결과 2페이지짜리를 만나면 렌더는 2페이지를 보이고 URL/상태도 `page=2`로 수렴한다(§6.5).
- 예: `/finance?usage=jeonse&page=3`

### 단일 URL 쓰기 경로 (중요 — 기존 `writeToUrl` 확장)

기존 `writeToUrl(criteria)`(30–40행)는 `criteria`만으로 `URLSearchParams`를 새로 만들어 `replaceState`로 **쿼리 문자열 전체를 덮어쓴다.** 따라서 `page`를 별도 경로로 쓰면 criteria 쓰기가 `?page`를 지워버린다. 이를 막기 위해 **쓰기 경로를 하나로 통합**한다:

```ts
writeToUrl(criteria, safePage)  // criteria + page를 함께 직렬화, safePage<=1이면 page 생략
```

- 이 통합 `writeToUrl`을 `[criteria, page]`에 반응하는 **단일 effect**가 호출한다.
- 쓰기 API는 §10 결정에 따른다. 권장 (가): `history.replaceState`.

## 5. 컴포넌트 변경

| 파일 | 변경 |
|---|---|
| `app/(public)/finance/page.tsx` | **변경 없음.** (전체 행 로드 유지, searchParams 안 읽음, Suspense 불필요) |
| `lib/pagination.ts` | 순수 헬퍼 `paginate(items, page, perPage)` 추가 (§4) |
| `app/(public)/finance/_components/loan-explorer.tsx` | `page` 상태 추가; `paginate()`로 `pageItems`만 렌더; 목록 하단에 `<Pagination>` 추가; 마운트 읽기·단일 쓰기 경로에 `page` 반영; 필터 변경 핸들러에서 page 리셋 |
| `components/ui/pagination.tsx` | **재사용 — 수정 없음** |

### `Pagination` 컴포넌트 계약 (기존)

```ts
interface PaginationProps {
  current: number;      // = safePage
  totalPages: number;   // = paginate().totalPages
  totalItems: number;   // = paginate().total
  perPage: number;      // = PER_PAGE
  onChange: (page: number) => void;
  disabled?: boolean;
}
```

## 6. 동작 명세

### 6.1 초기 읽기 (마운트, 원자적)

마운트 시 `criteria`와 `page`를 **한 번에** URL에서 복원한다. `page`는 `criteria`와 별개 상태이고 `readFromUrl()`은 `LoanFilterCriteria`(page 필드 없음)를 반환하므로, **별도 파서 `readPageFromUrl(): number`**를 둔다.

- `readPageFromUrl()`: `window.location.search`의 `page`를 파싱, `NaN`·`0`·음수·비정상 값은 **1**.
- 마운트 effect는 `setCriteria(readFromUrl())`와 `setPage(readPageFromUrl())`를 **함께** 실행한다. 이 경로는 §6.4의 page 리셋을 **트리거하지 않는다**(아래 참조).

### 6.2 렌더

`const { pageItems, total, totalPages, safePage } = paginate(visible, page, PER_PAGE)` 후 `pageItems`만 `<LoanCard>`로 렌더. 카드 마크업은 동일.

### 6.3 페이지 이동

`handlePageChange(p)` → `setPage(p)` → (단일 effect가 URL을 `safePage`로 갱신) → **목록 상단으로 스크롤 + 포커스 이동**(§7).

- URL 갱신 메커니즘은 §10 결정에 따른다. 권장 (가): `history.replaceState`(내비게이션 없음, 히스토리 항목 미생성).

### 6.4 필터·정렬 변경 시 page 리셋 (마운트와 분리 — 핵심 위험 지점)

`criteria`가 바뀌면 `page`를 **1로 리셋**한다. **단, 이 리셋은 사용자가 일으킨 필터/정렬 변경에만 적용하고, 마운트 복원(§6.1)에는 적용하지 않는다.**

- 이유: 마운트 시 `setCriteria(EMPTY → readFromUrl())` 자체가 "criteria 변경"이다. 리셋을 `[criteria]` effect로 구현하면 마운트 복원이 딥링크 `?page=N`을 즉시 1로 지워버려 공유·복원(§9/§10)이 깨진다.
- 구현 지침: page 리셋은 **`[criteria]` effect가 아니라** 사용자 입력 핸들러 안에서 한다. `LoanFilterBar`의 `onChange`와 정렬 `<select>`의 `onChange`를 `updateCriteria(next){ setCriteria(next); setPage(1); }`로 감싼다. 마운트 effect는 이 핸들러를 거치지 않고 상태를 직접 세팅하므로 리셋되지 않는다.

### 6.5 클램프 수렴

`safePage < page`(딥링크 과대·필터로 결과 축소)면 렌더는 `safePage`를 보이고, URL도 `safePage`로 쓰며, **상태도 `setPage(safePage)`로 맞춰** URL·상태·화면을 일치시킨다(stale `?page` 방지). `safePage === page`가 되면 안정(idempotent).

### 6.6 노출 조건 / 빈 결과

- `totalPages <= 1`이면 `<Pagination>`을 렌더하지 않는다.
- 빈 결과는 기존 "조건에 맞는 상품이 없습니다." empty state 유지(83–87행). 페이지네이션 숨김.

### 6.7 첫 페인트 플래시(FOUC) — 수용

`page.tsx`는 정적이고 `LoanExplorer`는 초기 상태(EMPTY criteria + page 1)로 SSR되므로, 서버 HTML은 **1페이지(첫 20개)**를 보인다. 마운트 읽기(§6.1)가 URL의 필터·페이지를 적용하며 화면이 바뀐다. 즉 딥링크 `?page=3`은 **한 페인트 동안 1페이지를 보였다가** 3페이지로 전환된다. 이는 기존 "필터 URL 복원 시 플래시"와 **같은 성질**이라 새 문제로 취급하지 않고 수용한다.

## 7. 접근성 (WCAG 2.1 AA)

- `Pagination` 컴포넌트는 이미 `aria-label`을 갖춘 버튼 기반(처음/이전/다음/마지막·모바일 점프). 컴포넌트 자체엔 추가 조치 불필요.
- **페이지 이동 시 포커스·스크롤(신규 동작 — 청약 래퍼엔 없음):** 목록 헤더("N개 상품" 행) 또는 목록 컨테이너에 `ref` + `tabIndex={-1}`를 부여하고, `handlePageChange`에서 `ref.scrollIntoView({ block: 'start' })` 후 `ref.focus()`를 호출한다. (이 설계는 `history.replaceState`를 쓰고 Next 내비게이션이 없으므로 `router.push`의 `scroll:false` 옵션은 **해당 없음**.)
- 색·그림자 등 시각 규칙은 카드 마크업을 건드리지 않으므로 영향 없음.

## 8. 테스트 계획

프로젝트 테스트 스택 실측: vitest는 `environment: 'node'`, `globals: false`이며, 컴포넌트 테스트(`tests/components/*-ssr.test.ts`)는 `renderToStaticMarkup`을 쓴다(**useEffect/useState 상호작용·클릭 불가**). `jsdom`·`@testing-library`는 **미설치**. 이 제약에 맞춰 층을 나눈다.

- **단위(`tests/lib`, node — 즉시 실행 가능) · 핵심:** 순수 헬퍼 `paginate(items, page, perPage)` 테스트 — 정상 slice, 마지막 페이지 부분 채움, `page > totalPages` 클램프, `page <= 0`/`NaN` → 1, 빈 배열 → `totalPages=1`·`pageItems=[]`. 슬라이스·클램프 로직의 검증은 여기서 끝낸다.
- **컴포넌트 SSR(`tests/components`, `renderToStaticMarkup`, node):** 초기 상태(page 1) 기준으로 (a) `PER_PAGE`개 카드만 렌더, (b) `totalPages>1`일 때 `Pagination` 마크업 존재. **상호작용(다음 클릭·필터 리셋)은 이 하니스에서 불가** → e2e로 이관.
- **e2e(`tests/e2e`, playwright):** **전제 — `tests/_helpers/seed-e2e.ts`가 현재 LoanProduct를 0건 심으므로, `PER_PAGE`(20)를 초과하는 대출상품 시드 스텝을 추가해야 한다.** 이후: `/finance` 진입 → 20개 카드 → 다음 페이지 클릭 → URL `?page=2` → 다음 20개 → 필터 적용 시 `page` 파라미터 제거되고 1페이지 복귀.
- **범위 밖:** 상호작용을 컴포넌트 레벨에서 테스트하려면 `jsdom`+`@testing-library` 도입(스택 변경)이 필요하다. 본 작업 범위에서 제외하며, 필요 시 별도 승인 후 진행한다.

## 9. SEO 영향 (무해 근거)

- 대출 상세(`/finance/{seq}`)는 **sitemap이 전량 등록**한다: `lib/sitemap/sources.ts`의 `loan` 소스(208–224행, URL 방출은 219행)가 `prisma.loanProduct.findMany`로 모든 seq를 `${SITE_URL}/finance/${l.seq}`로 방출. 크롤러는 목록 카드 링크가 아니라 sitemap으로 상세를 발견하므로, 목록을 20개씩 페이징해도 **상세 색인은 그대로**다.
- `/finance` 목록은 `lib/sitemap/static-entries.ts`(28행)에 priority 0.8로 등록돼 있고, `page.tsx`에 `alternates.canonical = '/finance'`가 이미 있다.
- `safePage <= 1`에서 `page` 파라미터를 생략하므로 canonical URL이 유지된다. `?page=N`은 버튼 기반(크롤 링크 아님) + 클라이언트 뷰 상태라 색인 중복·thin page 우려가 낮다.

## 10. 열린 결정 — 뒤로가기(back)로 페이지 이동을 기억할 것인가

기존 필터 동기화는 `history.replaceState`(히스토리 항목 미생성)를 쓰고, 마운트 시 1회만 URL을 읽는다(`popstate` 리스너 없음). 페이지 이동에 두 가지 선택지가 있다:

- **(가) `replaceState`만 사용 (권장 · 최소 변경)** — 페이지 이동이 URL을 갱신하지만 히스토리 항목을 만들지 않는다. **링크 공유·새로고침 복원은 됨**(마운트 시 읽으므로). 단 브라우저 뒤로가기가 페이지를 단계별로 되짚지는 않는다. 기존 파일의 의도적 패턴과 **완전히 일치**하고, `popstate` 리스너·이중 쓰기 경로가 필요 없다. §6은 이 (가)를 전제로 완결돼 있다.
- **(나) 페이지 이동에 `pushState` + `popstate` 리스너** — 뒤로가기가 페이지 3→2→1을 되짚는다. 대신 `popstate` 리스너로 URL→상태 재동기화(criteria+page)가 필요하고, 필터 변경(replace)과 페이지 이동(push)의 쓰기 경로가 나뉜다. (§4 단일 쓰기 경로가 mode 인자로 replace/push를 받도록 확장.)

**확정: (가) `replaceState`** (사용자 승인 2026-07-03). CLAUDE.md의 단순성·표면적 최소 변경 원칙, 그리고 이 파일이 이미 `replaceState`를 의도적으로 채택한 점에 부합한다. 공유·복원이라는 구체적 이득은 (가)로도 확보된다. 뒤로가기 단계 이동이 필요해지면 이후 별도 작업으로 (나)로 전환한다.

## 11. 영향 없음 / 범위 밖

- `page.tsx` 서버 로직, `getLoanSummaries`, `filterLoans`, `collectFacets` — 변경 없음.
- `LoanCard`, `LoanFilterBar` 마크업 — 변경 없음.
- ETL(`scripts/ingest/loan/*`), `LoanProduct` 스키마, 상세 라우트, sitemap — 변경 없음.
- 청약(`/subscription`) 및 공용 `Pagination` 컴포넌트 — 변경 없음.
- 새 테스트 프레임워크(jsdom/@testing-library) — 도입하지 않음(§8).
