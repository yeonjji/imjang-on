# 생활편의 그룹 허브 + sibling 탭 — 디자인 문서

- 작성일: 2026-05-28
- 작업 브랜치: `feature/amenity-flow-redesign` 위 (혹은 후속 브랜치)
- 선행 PR: #5 — 진입 흐름 재설계 (지역 picker 제거 + `/life` 그룹 허브 anchor 구조)

## 1. 배경

PR #5에서 `LIFE_GROUPS`(4그룹: `education`/`medical`/`amenity`/`urban`)를 단일 진실 소스로 도입하고, nav 그룹 라벨이 `/life#${slug}` 앵커로 점프하도록 만들었다. 그러나 사용자가 그룹 라벨을 눌러 들어간 화면에는 4그룹 전체가 한꺼번에 보여 "이 그룹만 둘러보고 싶다"는 의도와 어긋난다. 또한 LIST 화면에서 같은 그룹의 형제 카테고리로 이동할 동선이 없어 카테고리 간 비교가 불편하다.

## 2. 목표

1. 드롭다운에서 그룹 라벨(`교육시설`/`의료시설`/`상권·편의`/`도시인프라`)이 그 아래 하위 항목과 시각적으로 명확히 구분된다.
2. 그룹 라벨을 누르면 해당 그룹의 하위 카테고리만 보이는 별도 허브 페이지로 진입한다.
3. LIST 화면에서 같은 그룹의 sibling 카테고리로 한 번에 이동할 수 있는 탭이 존재한다.
4. 위 모든 변화가 `LIFE_GROUPS` 한 곳을 수정하면 nav/인덱스/그룹 허브/sibling 탭에 동시에 반영된다.

## 3. 결정 사항 요약

| | 결정 | 비고 |
|---|---|---|
| 라우팅 | **`/life/[group]` 동적 라우트** | slug 4개 정적 생성 |
| `/life` 인덱스 거취 | **유지** | 4그룹 섹션 노출 + 섹션 헤더에 "더보기 →" 링크 추가 |
| sibling 탭 범위 | **같은 그룹 모두 (live + Soon)** | Soon 탭은 회색 + Soon 배지, 클릭 시 SoonModal |
| 드롭다운 그룹 라벨 시각 | **시안 A — 구분선 + 14px** | 라벨 아래 `border-b` 1px |
| LIST 탭 디자인 | **시안 B — Underline 탭** | 활성: `border-b-2 border-blue` + `text-blue-dark` |
| breadcrumb | **그대로 유지** | LIST의 마지막 카테고리도 그대로 표시 |
| 활성 탭 클릭 동작 | **no-op** | 스크롤탑 등 부수 동작 없음 |

## 4. 정보 아키텍처

### 4.1 라우트 맵

| 경로 | 변화 | 내용 |
|---|---|---|
| `/life` | 유지 | 4그룹 전부 한 화면. 각 섹션 헤더에 "더보기 →" 링크 → `/life/[group]`. 기존 `id={slug}` 앵커는 잔존 |
| `/life/[group]` | **신규** | `group` ∈ `education`/`medical`/`amenity`/`urban`. 해당 그룹의 하위 카테고리만 카드로 노출. 잘못된 slug → `notFound()` |
| `/amenity/[category]`, `/school` 등 LIST | 본체 변경 없음 | hero 박스 바로 아래에 `<SiblingTabs>` 마운트 |

### 4.2 네비 동선

| 진입점 | 현재 | 변경 후 |
|---|---|---|
| 데스크톱 드롭다운 그룹 라벨 | `/life#${slug}` | `/life/${slug}` |
| 모바일 드로어 그룹 라벨 | `/life#${slug}` | `/life/${slug}` |
| /life 인덱스 섹션 헤더 | 없음 | "더보기 →" 링크 → `/life/${slug}` |
| 그룹 허브의 카테고리 카드 | — | live → 해당 LIST 경로 (`href` 그대로), Soon → SoonModal |
| LIST 화면 sibling 탭 | 없음 | 같은 그룹 sibling 모두 표시 (live + Soon) |

## 5. 데이터·컴포넌트 변경

### 5.1 기존 파일 수정

| 파일 | 변경 |
|---|---|
| `app/(public)/_components/life-menu.ts` | `LifeGroup`에 `intro: string` 필드 추가(그룹 허브 hero용 1줄 설명). 4그룹 모두 채움 |
| `app/(public)/_components/life-dropdown.tsx` | 그룹 라벨 `href`를 `/life#${slug}` → `/life/${slug}`. 라벨 스타일을 시안 A로(14px / `pb-1.5 mb-1 border-b border-[var(--color-line)]`) |
| `app/(public)/_components/mobile-drawer.tsx` | 동일 `href` 변경 + 라벨 시각 분리 톤 일치 |
| `app/(public)/life/page.tsx` | 각 그룹 섹션 헤더 `<h2>` 옆에 "더보기 →" 링크(`/life/${slug}`) 추가. `id={slug}` 앵커는 유지(외부 링크 호환) |

### 5.2 신규 파일

| 파일 | 역할 |
|---|---|
| `app/(public)/life/[group]/page.tsx` | 그룹 허브 페이지. `generateStaticParams` 4개. `notFound()` 처리. metadata: `title=<라벨> — 우리 동네 생활편의`, description=`group.intro`, canonical `/life/${slug}`. `revalidate = 86_400`. 카드 그리드는 `/life` 인덱스와 동일 (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`). 기존 `LifeItemCard` 재사용 |
| `lib/life/sibling-tabs.ts` | `getSiblingTabs(currentHref: string) → { items: LifeSubItem[]; activeLabel: string; group: LifeGroup } \| null`. `LIFE_GROUPS`에서 `href` 정확 일치 매칭으로 그룹 역추출 (`/amenity/convenience` 등 path 일치 비교). 매칭 실패 시 `null` 리턴(탭 미마운트). 향후 `/school` 같은 평면 LIST도 `href`만 등록되면 자동 매칭 |
| `app/(public)/_components/sibling-tabs.tsx` | underline 탭 **client** 컴포넌트. 활성 탭 = `text-[var(--color-blue-dark)] border-b-2 border-[var(--color-blue)] font-extrabold`, 비활성 = `text-[var(--color-muted)]`. live 탭 = `<Link>` (활성 탭은 `e.preventDefault()`로 no-op), Soon 탭 = `<button>` → 내부 `useState`로 `SoonModal` 직접 오픈. 외부 prop 없음 (서버 컴포넌트에서 바로 마운트 가능) |

### 5.3 LIST 페이지에 탭 끼우기

| 파일 | 변경 |
|---|---|
| `app/(public)/amenity/[category]/page.tsx` | hero 박스 바로 아래에 `<SiblingTabs currentHref={`/amenity/${category}`} />` 마운트. 기존 LIST/필터/페이지네이션 로직은 손대지 않음 |
| `app/(public)/school/page.tsx` | 동일 (`currentHref="/school"`) |
| *(향후 medical/urban LIST 생성 시)* | 동일 패턴 |

## 6. UX 동작 디테일

| 상황 | 동작 |
|---|---|
| 그룹 허브 진입 (예: `/life/education`) | hero(그룹 라벨/제목/1줄 설명) + 해당 그룹 카드 그리드만. 다른 그룹 카드 없음 |
| 그룹 허브에서 Soon 카드 클릭 | 기존 `LifeItemCard` 동작 유지 (SoonModal) |
| LIST에서 같은 그룹 live 탭 클릭 | `next/link`로 해당 LIST 이동. 쿼리(`?sido=서울` 등) 유지 X — 카테고리만 단순 이동. 각 LIST가 자체 시드 redirect로 처리 |
| LIST에서 Soon 탭 클릭 | SoonModal 오픈, URL 변화 없음 |
| LIST에서 본인(활성) 탭 클릭 | no-op (`e.preventDefault()`). 스크롤 등 부수 동작 없음 |
| 모바일 LIST 탭 | 그룹당 카테고리 ≤ 4개라 가로 스크롤 불필요. underline 탭 그대로 |
| 잘못된 그룹 slug (`/life/foo`) | `notFound()` → 기본 404 |

## 7. SEO·메타

| 항목 | 처리 |
|---|---|
| 그룹 허브 canonical | `/life/${slug}` |
| 그룹 허브 metadata | title `"<라벨> — 우리 동네 생활편의"`, description: 그룹별 1줄 (LIFE_GROUPS `intro`) |
| sitemap | `app/sitemap.ts`에 4개 그룹 허브 URL 추가 |
| 기존 `/life#anchor` 외부 링크 | 그대로 동작 (앵커 id 유지). 별도 redirect 불필요 |
| `revalidate` | 24h (`86_400`) — /life 인덱스와 동일 |

## 8. 검증·테스트 계획

| 테스트 | 도구 |
|---|---|
| `lib/life/sibling-tabs.ts` `getSiblingTabs` 유닛 — `/school` → education 그룹 (학교 active, 어린이집 Soon) | vitest |
| `LIFE_GROUPS` invariant — 모든 그룹 ≥ 1 항목, slug 유니크 | vitest |
| `/life/[group]` 4개 slug 렌더 + 잘못된 slug → 404 | vitest (RTL) |
| 드롭다운 그룹 라벨 클릭 → `/life/${slug}` 이동 (`life-dropdown.test.tsx` 갱신) | vitest (RTL) |
| LIST sibling 탭 활성 표시 + Soon 클릭 → SoonModal 노출 | playwright |
| `pnpm tsc --noEmit` 0 error | tsc |

## 9. 스코프 가드 (이번 작업에서 다루지 않음)

- `/amenity/[category]` URL/필터/페이지네이션 로직은 손대지 않음 (탭 마운트만)
- `/school` LIST 본체 로직 손대지 않음
- `LIFE_GROUPS`의 `href` 값 그대로 유지 — 탭은 이 href를 그대로 따라감
- medical/urban LIST 본체 신규 작성은 별도 작업 (그룹 허브 / sibling 탭 패턴만 준비)
- DETAIL 페이지에는 sibling 탭 마운트하지 않음 (이번 범위에서 제외)
