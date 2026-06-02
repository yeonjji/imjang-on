# Hospital UI Improvements — Design Spec

**Date:** 2026-06-02  
**Scope:** 병원·의원 목록 페이지 레이아웃 개선 + 상세 페이지 주변 인프라 개수 제한

---

## 1. 목록 페이지 레이아웃 개선

### 목표
amenity(`/amenity/[category]`) 페이지와 동일한 구조로 통일성 확보.

### 현재 상태
- 필터: 가로 flex, `<select>` 드롭다운 3개 (시도·시군구·종류)
- 리스트: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (사이드바 없음)
- 모바일 필터: 별도 처리 없음

### 변경 사항

#### 레이아웃 구조
```
[aside w-280px sticky]     [main flex-1]
┌──────────────────┐       ┌──────────────────────────┐
│ 필터              │       │ 결과 N개                   │
│ ────────────     │       │ ┌────────┐ ┌────────┐    │
│ 지역             │       │ │ 카드   │ │ 카드   │    │
│  [시도 ▼]        │       │ └────────┘ └────────┘    │
│  [시군구 ▼]      │       │ ┌────────┐ ┌────────┐    │
│                  │       │ │ 카드   │ │ 카드   │    │
│ 종류             │       │ └────────┘ └────────┘    │
│  [종류 ▼]        │       └──────────────────────────┘
└──────────────────┘
```

#### 변경 파일

**`hospital-filter-panel.tsx`**
- 세로 섹션형으로 재작성 (amenity-filter-panel 패턴)
- "지역" 섹션: 시도 select → 시군구 select (시도 선택 후 표시)
- "종류" 섹션: 종류 select
- 스타일: `w-full rounded-xl border` select, 섹션 헤더 `text-sm font-bold`

**`hospital-mobile-filter-sheet.tsx` (신규)**
- 모바일 bottom sheet 필터 (amenity-mobile-filter-sheet 패턴)
- 화면 상단 "필터" 버튼으로 오픈
- 내부에 `HospitalFilterPanel` 재사용

**`page.tsx`**
- `<div className="flex items-start gap-6">` 레이아웃 적용
- `aside`: `sticky top-[88px] hidden w-[280px] shrink-0 md:block`
  - 내부: `rounded-[22px] border bg-white p-5 shadow` 박스에 `HospitalFilterPanel`
- `main`: `min-w-0 flex-1`
  - 상단 결과 수 표시 박스 (`rounded-[18px] border bg-white px-5 py-3`)
  - 카드 그리드: `grid grid-cols-1 gap-3 sm:grid-cols-2`
  - 페이지네이션 유지
- 모바일: `<HospitalMobileFilterSheet />` 추가 (aside 위에)
- 기존 `<div className="mb-6">` 필터 영역 제거

---

## 2. 상세 페이지 주변 인프라 5개 제한

### 목표
인프라 카테고리별 개수 불균형으로 인한 레이아웃 깨짐 방지.

### 현재 상태
- `HospitalNearby`가 각 카테고리 배열을 전체 렌더
- 카테고리마다 개수 차이 → 2열 그리드 카드 높이 불균일

### 변경 사항

**`hospital-nearby.tsx`**
- `sections` 배열 구성 시 각 배열을 `.slice(0, 5)` 적용
- 거리순 정렬은 쿼리에서 이미 보장 → 추가 sort 불필요
- 빈 카테고리 숨김 로직(`show: items.length > 0`) 유지

```ts
// 변경 전
items={apts.map(...)}

// 변경 후
items={apts.slice(0, 5).map(...)}
```

---

## 비변경 사항
- `HospitalCard` 컴포넌트 내부 유지
- DB 쿼리 함수(`getNearbyApartments` 등) 수정 없음
- 상세 페이지 전체 구조 유지
- 페이지네이션 로직 유지
