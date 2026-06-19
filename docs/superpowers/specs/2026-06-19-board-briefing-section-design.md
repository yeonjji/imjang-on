# 상세 페이지 브리핑 섹션 + 메뉴 명칭 변경

- **날짜:** 2026-06-19
- **상태:** 설계 승인됨 (구현 계획 대기)

## 목표

1. 4개 상세 페이지 유형 하단에 최신 게시글(브리핑) 카드 섹션을 추가한다.
2. "오늘의 소식" 메뉴 명칭을 "임장ON 브리핑"으로 변경한다.

## 결정된 요구사항

브레인스토밍에서 확정된 사항:

- **노출할 글:** 카테고리 매칭 없이 **최신 전체 글**을 모든 섹션에서 동일하게 노출한다. (게시판 카테고리는 부동산·청약·금융·대출·경제뿐이고 '생활편의' 카테고리가 없어, 매칭 대신 최신 전체로 통일.)
- **개수:** 최신 4개.
- **적용 범위:** 개별 상세 페이지 전부 — `apt/[id]`, `villa/[id]`, `officetel/[id]`, `subscription/[id]`, `finance/[seq]`, `life/[group]`.
- **명칭 변경 범위:** 헤더 메뉴 + 모바일 메뉴 + 홈 섹션 제목 → "임장ON 브리핑". 새 상세 섹션 제목은 별도 문구 "최신 부동산·청약·금융 소식".
- **모바일 카드 배치:** 세로 1열.

## 1. 명칭 변경

`/board` 라우트는 변경하지 않는다(URL·SEO 영향 없음). 표시 라벨만 변경한다.

| 위치 | 현재 | 변경 |
|---|---|---|
| `app/(public)/_components/nav.tsx:37` | 오늘의 소식 | 임장ON 브리핑 |
| `app/(public)/_components/mobile-drawer.tsx:144` | 오늘의 소식 | 임장ON 브리핑 |
| `app/(public)/_components/home-news.tsx:22` | 📰 오늘의 소식 | 📰 임장ON 브리핑 |

## 2. 새 컴포넌트 — `app/(public)/_components/board-briefing-section.tsx`

자기완결형(self-contained) async 서버 컴포넌트로 만들어, 각 상세 페이지에는 한 줄만 추가되도록 한다.

```
export async function BoardBriefingSection({ className }: { className?: string }) {
  if (!isBoardPublic()) return null;          // 게시판 비공개면 미노출
  const posts = await getHomeLatestPosts(4);   // 기존 함수 재사용 — 새 쿼리 없음
  if (posts.length === 0) return null;         // 글 없으면 미노출
  // <section className={className}> 렌더
}
```

- **상단 여백:** 컴포넌트 자체는 마진을 갖지 않는다. 2단 레이아웃의 `<main>`(flex flex-col gap-N) 안에 들어가면 부모의 `gap`이 위 섹션들과 동일한 간격을 만든다. 단일 컬럼인 생활편의 허브에서는 `className="mt-16"`을 넘겨 간격을 준다.

- **섹션 제목:** `최신 부동산·청약·금융 소식`
- **우측 링크:** `전체 보기 →` → `/board`
- **카드 그리드:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (모바일 세로 1열)
- **카드 내용:** 카테고리 뱃지 · 제목(2줄 line-clamp) · `출처기관 · MM.DD`, 클릭 시 `/board/[slug]`
- **스타일:** `home-news.tsx`의 디자인 토큰(`--color-line`, `--shadow-soft`, `rounded-[20px]`, `--color-blue` 등)을 그대로 따른다. 한글 본문 14px 이상, 그림자는 `--shadow-soft` 하나(DESIGN 원칙 준수).
- **날짜 포맷:** `home-news.tsx`의 `shortDate`(MM.DD)와 동일한 표기.

### 설계 선택: 자기완결형 컴포넌트

페이지마다 `fetch + props 전달` 방식 대신 자기완결형 컴포넌트를 택한 이유 — 13개 페이지 수정을 `import 1줄 + JSX 1줄`로 최소화하기 위함(외과적 변경). 데이터는 기존 `getHomeLatestPosts`(`lib/board/post.ts`)를 재사용하므로 새 쿼리·새 모델·새 데이터 함수가 없다.

## 3. 삽입 위치

2단(콘텐츠+사이드바) 레이아웃 페이지에서는 `<BoardBriefingSection />`을 **콘텐츠 컬럼(`<main>`/`<div>`)의 마지막 자식**으로 둔다. 이렇게 하면 (a) 너비가 위쪽 섹션들과 정확히 일치하고(풀폭 아님), (b) 콘텐츠 컬럼이 길어져 우측 `sticky` 사이드바가 브리핑 영역까지 따라 내려온다. 페이지당 변경은 import 1줄 + JSX 1줄.

| 구분 | 페이지 | 파일 |
|---|---|---|
| 실거래가 | 아파트 상세 | `app/(public)/apt/[id]/page.tsx` |
| 실거래가 | 빌라 상세 | `app/(public)/villa/[id]/page.tsx` |
| 실거래가 | 오피스텔 상세 | `app/(public)/officetel/[id]/page.tsx` |
| 청약 | 청약 상세 | `app/(public)/subscription/[id]/page.tsx` |
| 금융 | 금융 상세 | `app/(public)/finance/[seq]/page.tsx` |
| 생활편의 | 학교 상세 | `app/(public)/school/[sigunguCode]/[id]/page.tsx` |
| 생활편의 | 어린이집 상세 | `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` |
| 생활편의 | 병원 상세 | `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` |
| 생활편의 | 약국 상세 | `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` |
| 생활편의 | 상권·편의 상세 | `app/(public)/amenity/[category]/[id]/page.tsx` |
| 생활편의 | 도시인프라 상세 | `app/(public)/urban/[category]/[id]/page.tsx` |
| 생활편의 | 충전소 상세 | `app/(public)/urban/charger/[id]/page.tsx` |
| 생활편의 | 그룹 허브(단일 컬럼) | `app/(public)/life/[group]/page.tsx` (`className="mt-16"`) |

## 4. 렌더링 / 신선도

모든 대상 페이지는 ISR이다(`revalidate`: 실거래가·청약 6h, 금융·생활 24h). 브리핑 섹션은 렌더 시점에 구워지고 revalidate 주기에 맞춰 갱신된다. 게시글이 공공 보도자료 기반이라 6~24h 지연 갱신은 허용 범위로 판단 — `force-dynamic` 불필요.

- 쿼리는 기존 `status + publishedAt` 인덱스를 타므로 가볍다.
- `finance`·`life`는 `generateStaticParams`라 빌드 시 페이지당 쿼리 1회가 추가되나 경미하다.

## 5. 검증

- 컴포넌트 동작: 글 있음 → 4카드, 글 0건 → `null`, `isBoardPublic()=false` → `null`.
- 6개 상세 페이지에 섹션이 포함되는지 확인.
- 날짜 포맷(MM.DD) 표기 확인.
- `pnpm lint` + typecheck 통과.

## 범위 밖 (YAGNI)

- 카테고리별 매칭/필터링 — 최신 전체로 통일하기로 했으므로 제외.
- '생활편의' 게시판 카테고리 신설 — 해당 글이 없으므로 제외.
- 가로 스크롤 카드 UI — 모바일 세로 1열로 확정.
- `/board` 라우트·SEO 변경 — 라벨만 변경.
