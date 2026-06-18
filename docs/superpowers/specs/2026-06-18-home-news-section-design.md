# 홈 하단 '오늘의 소식' 섹션 — 설계 스펙

- **날짜:** 2026-06-18
- **상태:** 승인됨 (구현 대기)
- **브랜치:** feat/board-topic-generate-from-source (현재) → 별도 작업 브랜치 권장

## 1. 목표

공개 게시판(`/board`)의 **게시된 글(PUBLISHED) 최신 5건**을 홈(`app/(public)/page.tsx`) **맨 아래**(AmenityHub "생활권까지 함께 보기" 아래, 푸터 위)에 노출한다. 방문자가 홈에서 바로 최신 소식을 보고 게시판으로 유입되게 한다.

기존 자동 게시판 파이프라인(생성·검수·게시)은 건드리지 않는다. 이 작업은 **읽기 전용 노출**만 추가한다.

## 2. 레이아웃 (확정: C안 — 헤드라인 + 리스트)

브라우저 목업으로 확정한 모습:

```
📰 오늘의 소식                                        전체 보기 →
공공기관 보도자료·고시를 사실 위주로 정리
┌─────────────────────────────┬──────────────────────────┐
│ [분류칩]                     │ [칩] 제목 ……         날짜 │
│ 대표 제목(최신 1건)          │ [칩] 제목 ……         날짜 │
│ 요약 3줄 클램프…             │ [칩] 제목 ……         날짜 │
│ 출처기관 · 날짜              │ [칩] 제목 ……         날짜 │
└─────────────────────────────┴──────────────────────────┘
   featured = 최신 1건            list = 다음 4건
```

- **대표(featured)** = `publishedAt` 최신 1건: 분류 칩 + 제목 + 요약(3줄 말줄임) + 출처기관 · 날짜
- **리스트(list)** = 그다음 4건: 분류 칩 + 제목(1줄 말줄임) + 날짜(보조)
- **제목** "📰 오늘의 소식" + 우측 **"전체 보기 →"** (→ `/board`). 메뉴 라벨 '오늘의 소식'과 일치
- 부제: "공공기관 보도자료·고시를 사실 위주로 정리"
- 리스트 행은 날짜가 아니라 **분류 칩**을 주 정보로 (현재 배치발행이라 날짜가 겹침)

### 시각 토큰 (기존 디자인 시스템 재사용)

- 컨테이너: 기존 섹션과 동일하게 `mt-16` 간격, `max-w-[1180px]` 안에서 렌더
- 칩: `bg-[var(--color-soft)] text-[var(--color-blue)]` (게시판 표와 동일)
- 카드/경계: `border-[var(--color-line)]`, 둥근 모서리, `shadow-[var(--shadow-soft)]`
- 제목색 `--color-blue-dark`, 본문/요약 `--color-muted`~`--color-text`
- 그림자는 `--shadow-soft` 하나만 (PRODUCT 원칙 준수)
- 반응형: `md` 이상 2열(좌 featured / 우 list), 모바일 1열 세로 스택

## 3. 데이터 계층

`lib/board/post.ts` 에 헬퍼 1개 추가 (기존 `listPublishedPosts` 패턴 그대로):

```ts
export interface HomePostItem {
  slug: string;
  title: string;
  summary: string;
  category: PostCategory;
  sourceName: string;
  publishedAt: Date;
}

/** 홈 '오늘의 소식'용: PUBLISHED 글 최신 N건. */
export async function getHomeLatestPosts(limit = 5): Promise<HomePostItem[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, title: true, summary: true, category: true, sourceName: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
}
```

- 단일 인덱스(`@@index([status, publishedAt(sort: Desc)])`)를 그대로 타므로 가볍다.
- `summary`는 featured 카드용으로만 추가 select (기존 `PostListItem`은 변경하지 않음 — 표는 summary 불필요).

## 4. 컴포넌트

신규: `app/(public)/_components/home-news.tsx` (서버 컴포넌트, `'use client'` 없음)

```tsx
export function HomeNews({ posts }: { posts: HomePostItem[] }) {
  if (posts.length === 0) return null;          // 0건이면 섹션 자체를 렌더하지 않음
  const [featured, ...rest] = posts;
  const list = rest.slice(0, 4);
  // featured 카드 + list. 각 항목 Link → /board/${slug}, 헤더 "전체 보기 →" → /board
}
```

- 날짜 표기: `publishedAt`에서 `MM.DD` 추출 (예: `06.18`). 보조 정보라 작게.
- 분류 라벨: `categoryLabel(category)` (`lib/board/labels.ts`).
- 링크: 각 글 `/board/${slug}`, 헤더 더보기 `/board`.
- 긴 제목/출처는 CSS 말줄임(featured 요약은 3줄 클램프, 리스트 제목은 1줄).

## 5. 홈 페이지 연결

`app/(public)/page.tsx`:

1. import: `getHomeLatestPosts` (+ `HomeNews`, `isBoardPublic`).
2. `Promise.all`에 항목 추가 (기존 `safe()` 폴백 패턴 동일):
   ```ts
   safe(isBoardPublic() ? getHomeLatestPosts(5) : Promise.resolve([]), []),
   ```
3. JSX: `<AmenityHub />` **다음 줄**(섹션의 맨 끝, 푸터 직전)에 `<HomeNews posts={latestPosts} />` 추가.

홈은 이미 `force-dynamic`이라 추가 렌더 설정 불필요. DB 블립 시 `safe(..., [])`로 빈 배열 폴백 → 섹션만 사라지고 페이지는 정상.

## 6. 노출/폴백 규칙

| 상황 | 동작 |
|---|---|
| 게시판 비공개 (`isBoardPublic()===false`) | 섹션 미렌더 (쿼리도 생략) |
| PUBLISHED 0건 | 섹션 미렌더 (`HomeNews`가 null 반환) |
| 1건 | featured만, 리스트 영역 없음 |
| 2~4건 | featured + 남은 만큼 리스트 |
| 5건 이상 | featured 1 + 리스트 4 (최대 5건 노출) |

> 관리자 미리보기(`?preview=`)는 홈에는 적용하지 않는다. 홈은 일반 공개 화면이므로 `isBoardPublic()`만 본다.

## 7. 범위 밖 (YAGNI)

- 카테고리 필터 / 페이지네이션 (그건 `/board`가 담당)
- 썸네일 이미지 (Post 모델에 이미지 없음 — 텍스트만)
- 캐싱·ISR 별도 설정 (홈 `force-dynamic` 유지)
- 게시판 생성·검수 로직 변경

## 8. 검증

- **단위 테스트** (`tests/lib`): `getHomeLatestPosts`가 PUBLISHED만, `publishedAt` 내림차순, `limit` 준수, DRAFT/REJECTED 제외하는지. (`.env.test` 로컬 docker DB로 검증 — 메모리 규칙)
- **렌더링**: 0/1/5건 케이스에서 `HomeNews`가 각각 null / featured만 / 5건을 내는지.
- **수동 확인**: 로컬에서 홈 맨 아래 섹션이 목업과 일치, 각 링크가 `/board`·`/board/[slug]`로 가는지.
- 빌드(`tsc`/`next build`) 통과.

## 9. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `lib/board/post.ts` | `HomePostItem` + `getHomeLatestPosts()` 추가 |
| `app/(public)/_components/home-news.tsx` | 신규 컴포넌트 |
| `app/(public)/page.tsx` | import + `Promise.all` 항목 + `<HomeNews>` 렌더 |
| `tests/lib/board-post.test.ts` (기존 파일에 추가) | `getHomeLatestPosts` 테스트 |

목업 참조: `.superpowers/brainstorm/2904-1781785425/content/article-section-c-real.html`
