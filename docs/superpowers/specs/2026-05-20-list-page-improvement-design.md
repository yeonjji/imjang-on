# /list 페이지 개선 설계 (A안 — 점진적 개선)

**날짜:** 2026-05-20
**범위:** `app/(public)/list/` 및 관련 컴포넌트, `components/ui/pagination.tsx`
**목표:** 모바일 카드 깨짐 수정 + 모바일 필터 접근성 + 지역 필터 UI + 정렬 강화 + 페이지네이션 모바일 간소화 + 스켈레톤 로딩

---

## 1. 배경 및 문제

현재 `/list` 페이지는 Phase 1에서 구현됐으나 아래 문제가 있다.

| 문제 | 원인 |
|------|------|
| 모바일 카드 깨짐 | `grid grid-cols-[1fr_200px]` — 200px 고정 컬럼이 좁은 화면에서 오버플로 |
| 모바일 필터 없음 | 사이드바에 `hidden md:block` — 모바일 사용자가 필터를 쓸 수 없음 |
| 지역 필터 UI 누락 | `?region=` 파라미터가 `page.tsx`에서 처리되지만 FilterPanel에 UI가 없음 |
| 정렬 옵션 부족 | 최신거래순·거래많은순 2개뿐. 가격 기준 정렬 없음 |
| 모바일 페이지네이션 | 페이지 번호 나열이 좁은 화면에서 넘침 |
| 로딩 공백 | 필터 변경 시 스켈레톤 없이 빈 화면 노출 |

---

## 2. 변경 범위 (A안 — 점진적 개선)

### 2.1 카드 레이아웃 (`property-list-card.tsx`)

**현재:**
```tsx
<article className="grid grid-cols-[1fr_200px] ...">
```

**변경:**
```tsx
<article className="grid grid-cols-1 md:grid-cols-[1fr_200px] ...">
```

- 모바일: 좌측 정보 블록 + 우측 요약 박스가 세로로 쌓임
- 우측 요약 박스(`12개월 거래 N건`)는 모바일에서 카드 하단에 배치
- 가격 박스 3분할(`grid-cols-3`)은 모바일·데스크톱 동일하게 유지

### 2.2 모바일 필터 버튼 (`list/page.tsx` + 새 컴포넌트)

- `md:hidden` 영역에 "필터" 버튼 추가
- 클릭 시 기존 `components/ui/bottom-sheet.tsx` 를 사용해 FilterPanel을 바텀시트로 표시
- 활성 필터가 있으면 버튼 옆에 뱃지 표시 (예: `아파트 × 매매`)
- 새 컴포넌트: `list/_components/mobile-filter-sheet.tsx`

### 2.3 지역 필터 (`list-filter-panel.tsx`)

- 시도 select → 시군구 select 드릴다운 UI 추가
- 시도 목록: `lib/region.ts`의 `getSidoList()` 활용 — `{ code, sido, fullName }` 반환
- 시군구 목록: 시도 선택 시 `lib/region.ts`의 `getSigungusBySido(sido)` 호출 (sido는 이름 문자열)
- 시군구 선택값: `?region=<sigunguCode>` 파라미터로 전달 (page.tsx에서 이미 처리)
- 시도만 선택(시군구 미선택) 시: `lib/property.ts`의 where에 `region: { sido: sidoName }` 조건 추가 (`sigunguCode` 대신 관계 필터 사용)

### 2.4 정렬 옵션 확장 (`list-filter-panel.tsx` + `lib/property.ts`)

현재 `SortOption = 'recent' | 'volume'`에 2개 추가:

| 값 | 설명 | 정렬 기준 |
|----|------|----------|
| `recent` | 최신거래순 | `lastTxDate DESC` |
| `volume` | 거래많은순 | `txCount12m DESC` |
| `price_desc` | 가격 높은순 | `saleLastPrice DESC NULLS LAST` |
| `price_asc` | 가격 낮은순 | `saleLastPrice ASC NULLS LAST` |

- `price_desc` / `price_asc`는 deal=sale일 때 의미있음. 다른 deal 필터 선택 시에도 노출하되 `saleLastPrice` 기준 적용.

### 2.5 페이지네이션 모바일 간소화 (`components/ui/pagination.tsx`)

- 모바일(`md:` 미만): 이전 버튼 + `{current} / {totalPages}` 텍스트 + 다음 버튼만 표시
- 데스크톱: 현재 동작 그대로 유지 (페이지 번호 나열)
- 구현: 내부에 `useMediaQuery` 없이 Tailwind `hidden md:flex` / `flex md:hidden` 조합으로 처리

```tsx
{/* 모바일용 */}
<div className="flex md:hidden items-center gap-3">
  <IconBtn ... /> {/* 이전 */}
  <span>{current} / {totalPages}</span>
  <IconBtn ... /> {/* 다음 */}
</div>
{/* 데스크톱용 */}
<nav className="hidden md:flex items-center gap-1">
  ...기존 코드...
</nav>
```

### 2.6 스켈레톤 로딩 (`list/page.tsx`)

- 카드 목록 영역을 `<Suspense fallback={<ListSkeleton />}>` 으로 감쌈
- `ListSkeleton`: 카드 모양 회색 플레이스홀더 5개
- 새 컴포넌트: `list/_components/list-skeleton.tsx`
- 필터 변경(router.push) 시 자동으로 Suspense fallback 노출됨

---

## 3. 영향받는 파일

| 파일 | 변경 유형 |
|------|----------|
| `app/(public)/list/_components/property-list-card.tsx` | 수정 — grid 반응형 |
| `app/(public)/list/_components/list-filter-panel.tsx` | 수정 — 지역 드릴다운, 정렬 2개 추가 |
| `app/(public)/list/_components/mobile-filter-sheet.tsx` | 신규 — 모바일 바텀시트 래퍼 |
| `app/(public)/list/_components/list-skeleton.tsx` | 신규 — 스켈레톤 컴포넌트 |
| `app/(public)/list/page.tsx` | 수정 — Suspense 경계, 모바일 필터 버튼 |
| `components/ui/pagination.tsx` | 수정 — 모바일/데스크톱 분기 |
| `lib/property.ts` | 수정 — SortOption 2개 추가, 시도 단위 region 필터 |
| `lib/region.ts` | 확인 완료 — `getSidoList` ✅ · `getSigungusBySido` ✅ 이미 존재 |

---

## 4. 데이터 모델 변경

없음. 기존 `Property`, `Region` 모델 그대로 사용.

---

## 5. 검증 기준

| 항목 | 기준 |
|------|------|
| 모바일 카드 | 375px 뷰포트에서 가로 스크롤 없이 렌더링 |
| 모바일 필터 | 바텀시트 열림/닫힘, 필터 적용 후 URL 파라미터 반영 |
| 지역 필터 | 시도 선택 → 시군구 목록 갱신, ?region= 파라미터 정상 전달 |
| 정렬 | price_desc/price_asc 선택 시 결과 순서 변경 |
| 모바일 페이지네이션 | 375px에서 이전/페이지수/다음만 표시 |
| 스켈레톤 | 필터 변경 시 카드 영역에 skeleton 노출 |

---

## 6. 제외 범위

- 키워드 검색 (단지명 입력) — Phase 2 이후
- 무한스크롤 — 페이지네이션 유지
- 카드 디자인 개편 (가격 추이 ↑↓, 최근거래일 표시) — 별도 태스크
- Sentry / GA4 — Phase 1E에서 별도 처리
