# L4 — POI 상세 "관련 가이드" 블록 배선 (Design)

**작성일:** 2026-07-02
**로드맵 위치:** thin-content remediation L4 (polish). L7 evergreen `/guide` 시스템은 이미 완성·배포됨(14편 게시). 본 작업은 그 게시된 가이드를 POI/매물 상세와 내부링크로 연결하는 마지막 코드 갭.

## 0. 목표 & 성공기준

- **목표:** 각 POI/매물 상세 페이지 하단에, 해당 페이지 카테고리에 맞는 PUBLISHED 가이드 최대 3편을 링크하는 "관련 가이드" 블록을 렌더.
- **성공기준:**
  - 매핑된 카테고리에 PUBLISHED 가이드가 있으면 상세 페이지에 "관련 가이드" 섹션과 `/guide/{slug}` 링크가 SSR 마크업으로 렌더된다.
  - 매핑 없는 pageKey거나 가이드 0편이면 **아무것도 렌더하지 않는다**(빈 블록 금지).
  - 12개 대상 페이지 각각에 자기 pageKey로 배선된다.

## 1. 핵심 결정 (확정)

- **재사용:** `guideCategoryForPage(pageKey)`(lib/guide/page-category.ts)와 `getGuidesByCategory(category, limit=3)`(lib/guide/queries.ts) 기존 헬퍼를 그대로 사용. 신규 쿼리/매핑 없음.
- **패턴 미러링:** `BoardBriefingSection`과 동일한 "자기 데이터 fetch → 없으면 null" async 서버 컴포넌트 패턴을 따른다.
- **매핑 테이블은 현행 유지:** urban(공원·주차장)·charger·board는 `PAGE_TO_GUIDE`에 없으므로 블록 미표시. 새 매핑 추가 없음(사용자 결정).
- **세로 순서:** 상세 본문 → `BoardBriefingSection`(최신 소식) → **`RelatedGuides`(관련 가이드)** 순. 관련 가이드가 아래(사용자 결정).
- **관심사 분리:** 렌더는 순수 sync 뷰로, 데이터 fetch는 얇은 async 래퍼로 분리 → 뷰를 `renderToStaticMarkup`으로 단위 테스트 가능(기존 `*-ssr.test.ts` 패턴).

## 2. 컴포넌트 설계

**파일:** `app/(public)/_components/related-guides.tsx` (신규)

### 2.1 순수 뷰 (sync, export)

```
RelatedGuidesView({ items, className }: {
  items: RelatedGuideItem[];   // { id: bigint; slug: string; title: string }
  className?: string;
})
```
- `items.length === 0` → `null` 반환(빈 블록 금지).
- 아니면 `<section>` 렌더:
  - 헤딩 `<h2>관련 가이드</h2>` + 보조문구(예: "실제 절차·개념을 정리한 안내 글") + `/guide` "전체 보기 →" 링크
  - 각 item → `<Link href={`/guide/${item.slug}`}>` 카드(title). BoardBriefingSection 카드 스타일 재사용(`rounded`, `border`, `shadow-[var(--shadow-soft)]`, hover 등).
  - 그리드: BoardBriefingSection과 동일한 반응형(모바일 1열 → sm 2열 → lg 다열). limit=3이므로 lg 3열.

### 2.2 async 데이터 래퍼 (export, 기본 진입점)

```
RelatedGuides({ pageKey, className, limit = 3 }: {
  pageKey: string;
  className?: string;
  limit?: number;
})
```
- `const category = guideCategoryForPage(pageKey);`
- `if (!category) return null;`
- `const items = await getGuidesByCategory(category, limit);`
- `return <RelatedGuidesView items={items} className={className} />;` (items 빈 배열이면 뷰가 null 반환)

**의존성:** `guideCategoryForPage`, `getGuidesByCategory`, `RelatedGuideItem`(queries.ts), `next/link`. 신규 DB 접근 없음.

## 3. 배선 (12개 페이지)

각 페이지의 기존 `<BoardBriefingSection ... />` **바로 아래**에 `<RelatedGuides pageKey="<키>" />` 삽입. import 1줄 추가.

| 페이지 | pageKey | 카테고리 |
|---|---|---|
| `medical/hospital/[sigunguCode]/[id]` | `medical/hospital` | MEDICAL |
| `medical/pharmacy/[sigunguCode]/[id]` | `medical/pharmacy` | MEDICAL |
| `childcare/[sigunguCode]/[id]` | `childcare` | CHILDCARE |
| `school/[sigunguCode]/[id]` | `school` | SCHOOL |
| `apt/[id]` | `apt` | REALESTATE |
| `villa/[id]` | `villa` | REALESTATE |
| `officetel/[id]` | `officetel` | REALESTATE |
| `subscription/[id]` | `subscription` | SUBSCRIPTION |
| `finance/[seq]` | `finance` | FINANCE |
| `jeonse-guarantee/[grntDvcd]` | `jeonse-guarantee` | FINANCE |
| `amenity/[category]/[id]` | `amenity` | LIFE |
| `life/[group]` | `life` | LIFE |

**대상 아님(매핑 없음, 블록 미표시):** `urban/[category]/[id]`(공원·주차장), `urban/charger/[id]`, `board/[id]`. 이들엔 배선하지 않는다(항상 null인 dead wiring 방지).

## 4. 테스트 & 검증

- **단위(신규)** `tests/components/related-guides-ssr.test.ts`:
  - `RelatedGuidesView({ items: [2건] })` → 마크업에 각 title과 `href="/guide/{slug}"` 포함.
  - `RelatedGuidesView({ items: [] })` → 빈 마크업(null) 렌더.
  - (SSR 테스트 패턴: `renderToStaticMarkup` + `globalThis.React` shim, 기존 `hospital-tabs-ssr.test.ts`와 동일)
- **기존 커버리지 재사용:** `guideCategoryForPage` 매핑은 `tests/lib/guide-page-category.test.ts`가 이미 검증(async 래퍼의 null 분기 근거).
- **회귀:** `pnpm tsc --noEmit` 통과.
- **수동 스모크(선택):** 병원 상세 view-source에 "관련 가이드" + `/guide/` 링크 존재, urban 공원 상세엔 없음.

## 5. 범위 밖 (YAGNI)

- 새 매핑 추가(공원→LIFE 등) · 가이드 카드에 요약/날짜/카테고리 배지 추가(제목 링크만) · 지역 곱하기 · 가이드 편수 증대(운영) · JSON-LD 변경 · `RelatedGuides`를 매핑 없는 페이지(urban/charger/board)에 배선.

## 6. 구현 단위 (plan 분해 예고)

1. `RelatedGuidesView` + `RelatedGuides` 컴포넌트 작성 + SSR 단위 테스트.
2. 12개 페이지에 `<RelatedGuides pageKey=.../>` 배선 + tsc 통과 확인.
