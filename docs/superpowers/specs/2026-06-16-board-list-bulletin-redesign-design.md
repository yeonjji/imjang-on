# 게시판(`/board`) 목록 — 표(게시판형) 리디자인

- **날짜:** 2026-06-16
- **범위:** 공개 게시판 목록 페이지(`/board`)의 UI/데이터 재구성. 상세 페이지·ETL·관리자 화면은 변경하지 않는다.
- **배경:** 게시물 이미지를 AI로 별도 생성하지 않기로 결정 → 카드형(썸네일 의존) 목록을 버리고, 다른 콘텐츠 페이지(실거래가·생활편의·청약)의 카드 UI와 구분되는 "게시판형 표 리스트"로 바꾼다. 빈 공간은 오른쪽 보조 레일로 채운다.

## 1. 목표와 성공 기준

- 목록이 **카드 그리드 → 표(게시판형 리스트)**로 바뀐다. 행마다 이미지가 없다.
- 카테고리 탭은 **위쪽**에 유지. 본문 오른쪽에 보조 **레일**을 둔다(2단).
- 빈 느낌 없이 정보가 채워진다(표 컬럼 + 레일 3카드).
- 디자인 시스템(`DESIGN.md`) 준수: 단일 `--shadow-soft`, 22px 카드 라운드, pill 칩, 색은 정보 전달용, 한글 본문 14px 이상, WCAG 2.1 AA.

**성공 기준(검증 가능):**
1. `/board`(미리보기 토큰)에서 표 형태 목록이 렌더되고, 행에 `<img>`가 없다.
2. 탭/레일의 분야 링크로 `?category=` 필터가 동작한다.
3. 레일의 "분야별 글 수", "출처 기관"이 실제 DB 집계로 표시된다.
4. 모바일 폭에서 "출처" 컬럼이 접히고 제목·등록일 위주로 보인다.
5. `pnpm lint`·`pnpm build` 통과, 기존 board 테스트 통과.

## 2. 최종 레이아웃

```
┌───────────────────────────────────────────────┐
│ 소식 / 오늘의 이슈                              │   ← 헤더(설명 문구 제거)
├───────────────────────────────────────────────┤
│ [전체][금융][대출][경제][청약][부동산]          │   ← 위쪽 탭(기존 로직 유지)
├──────────────────────────────┬────────────────┤
│ 표 게시판                     │ 레일            │
│  분류 | 제목 | 출처 | 등록일  │ · 이 게시판은   │
│  ───────────────────────────  │ · 분야별 글     │
│  [청약] 제목…  국토부  06-12   │ · 출처 기관     │
│  [대출] 제목…  HUG    06-11    │                │
│  …                            │                │
│  [1][2][3][4]  (페이지네이션) │                │
└──────────────────────────────┴────────────────┘
```

모바일: 레일은 본문 리스트 **아래로** 내려가 세로로 쌓인다(`lg` 이상에서만 2단).

### 2.1 헤더
- eyebrow `소식` + H1 **`오늘의 이슈`**.
- 기존 설명 문구("공공기관 자료에 근거한 사실 정보입니다. 전망·추천은 포함하지 않습니다.") **제거**. (동일 취지 안내는 레일 "이 게시판은" 카드가 담당.)
- `metadata.title`을 `소식 — 오늘의 이슈`로 맞춘다(`description`은 유지).

### 2.2 표(게시판형 리스트)
- 시맨틱 `<table>` 사용(스크린리더 컬럼 관계). `<caption className="sr-only">오늘의 이슈 목록</caption>`, `<th scope="col">`.
- 상단 2px Deep Archive Blue(`--color-blue-dark`) 가로줄 + 헤더행. 데이터행은 hairline(`--color-line` 톤) 구분선, hover 시 `--color-soft` 배경.
- 컬럼:
  | 컬럼 | 내용 | 비고 |
  |---|---|---|
  | 분류 | 카테고리 배지(`categoryLabel`) | pill, `text-xs` 라벨 |
  | 제목 | `p.title`, 1줄 ellipsis, `/board/[slug]` 링크 | `text-sm`(14px) `font-semibold` blue-dark |
  | 출처 | `p.sourceName`, 1줄 ellipsis | `text-xs` muted, **모바일에서 숨김** |
  | 등록일 | `p.publishedAt` → `YYYY-MM-DD` | `text-xs` muted, 우측 정렬 |
- 행 클릭 영역: 제목 셀의 `<a>`(미리보기 모드면 `previewQs` 유지). 행 전체 hover는 CSS 시각 효과.
- **요약·이미지 없음**(순수 표). 유형(제도·상품/이슈·동향)은 표에서 생략(상세에서 노출).
- 빈 상태: 기존 "아직 게시된 글이 없습니다." 유지.
- 페이지네이션: 기존 로직·UI 유지.

### 2.3 오른쪽 레일(채움 요소)
흰 카드 3개(`--shadow-soft`, 22px 라운드). 모두 실제 DB로 채운다.
1. **이 게시판은** — 정적 안내: "공공기관 보도자료·고시를 토대로 사실만 정리합니다. 전망·투자 추천은 담지 않습니다."
2. **분야별 글** — `BOARD_CATEGORIES` 순서로 분야명 + PUBLISHED 글 수. 각 행은 `?category=<value>` 필터 링크(미리보기면 토큰 유지).
3. **출처 기관** — PUBLISHED 글의 `sourceName` distinct 목록(글 수 desc, 상위 ~8개)을 pill로.

## 3. 데이터/쿼리 변경 — `lib/board/post.ts`

`listPublishedPosts`만 이 함수를 소비(확인 완료) → select 변경 안전.

1. `PostListItem` 변경: `summary`·`sourceDate` 제거, `sourceName` 추가.
   - 최종: `{ slug, title, category, sourceName, publishedAt }`
   - `listPublishedPosts`의 `select`를 동일하게 조정.
2. 신규 `getBoardCategoryCounts(): Promise<Record<PostCategory, number>>`
   - `prisma.post.groupBy({ by: ['category'], where: { status: 'PUBLISHED' }, _count: { _all: true } })`
   - 모든 카테고리를 0으로 초기화 후 결과 병합(0건 분야도 표시).
3. 신규 `getBoardSourceOrgs(limit = 8): Promise<string[]>`
   - `prisma.post.groupBy({ by: ['sourceName'], where: { status: 'PUBLISHED' }, _count: { _all: true }, orderBy: { _count: { sourceName: 'desc' } }, take: limit })` → `sourceName[]`.

페이지에서 `listPublishedPosts`, `getBoardCategoryCounts`, `getBoardSourceOrgs`를 `Promise.all`로 병렬 조회.

## 4. 미리보기/공개 가드

- `canViewBoard(sp.preview)` 게이트, `previewQs`(상세 링크·탭·레일 분야 링크에 토큰 전파) **그대로 유지**.
- 레일 집계는 PUBLISHED만 카운트(미리보기 모드에서도 게시본 기준 일관).
- `export const revalidate = 3600` 유지. 관리자 게시 시 `revalidatePath('/board')`가 이미 있어 목록·레일이 갱신된다.

## 5. 접근성/디자인 체크
- 색만으로 정보 전달하지 않음(분류는 배지 텍스트 라벨 동반).
- 14px 바닥선: 제목 14px 본문, 출처·날짜·배지는 `text-xs`(라벨/캡션 허용 범위).
- 키보드 탐색 가능(제목 링크 포커스), `prefers-reduced-motion` 영향 요소 없음(색 전환만).
- 그림자는 카드/레일에 `--shadow-soft` 하나만.

## 6. 구현 단위(파일)
1. `lib/board/post.ts` — 타입·select 조정 + 집계 함수 2개 추가.
2. `app/(public)/board/page.tsx` — 헤더 문구 제거·제목 변경, 카드 그리드 → 표, 2단 레이아웃 + 레일, `metadata` 정리. 레일은 page.tsx 인라인으로 두되 가독성 떨어지면 `app/(public)/board/_components/board-rail.tsx`로 분리.

## 7. 범위 밖(명시)
- **상세 페이지(`[slug]/page.tsx`)·OG/thumbnail 라우트:** 변경 없음. thumbnail 라우트는 상세의 og:image·본문 이미지에서 계속 사용되므로 삭제하지 않는다.
- **조회수/인기글:** `Post` 모델에 조회수 필드가 없어 이번 범위 밖.
- **내비 "소식" 라벨, 카테고리/유형 정의:** 유지.

## 8. 검증 계획
- `pnpm lint`, `pnpm build`(타입 포함) 통과.
- board 관련 기존 테스트 실행(있다면) — `pnpm test` 중 board 스코프.
- 수동: 미리보기 토큰으로 `/board` 접속 → 표 렌더·이미지 없음, 탭/레일 분야 필터, 레일 집계 값, 모바일에서 출처 컬럼 숨김, 빈 상태, 페이지네이션 확인.
