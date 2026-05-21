# List 페이지 필터 UX 개선 설계

**날짜:** 2026-05-21  
**범위:** `/list` 페이지 사이드바 스크롤 버그 수정, Nav 지역 메뉴 제거, 가격 범위 슬라이더 추가

---

## 1. 사이드바 독립 스크롤

### 문제
사이드바 필터 패널이 `sticky`이지만 자체 스크롤 컨테이너가 없어서, 마우스 휠 스크롤 시 페이지 전체가 스크롤됨. 필터 패널 하단 항목(면적, 정렬 등)이 뷰포트 밖으로 밀려 접근 불가.

### 해결
`list/page.tsx`의 aside 내부 흰 카드 div에 `max-h-[calc(100vh-104px)] overflow-y-auto` 추가.

```
aside (sticky top-[88px])
└── div.rounded-[22px]
    → max-h-[calc(100vh-104px)] overflow-y-auto 추가
```

**변경 파일:** `app/(public)/list/page.tsx` (1줄)

---

## 2. Nav "지역" 메뉴 제거

### 문제
Nav의 "지역" 링크(`/region`)가 현재 404. `/region/[code]` 라우트만 존재하고 인덱스 페이지 없음.

### 해결
Nav에서 "지역" 링크를 완전히 제거. 지역 탐색은 `/list` 페이지 필터로 대체.  
청약·생활권 Soon 버튼은 유지.

**변경 파일:** `app/(public)/_components/nav.tsx` (1줄 삭제)

---

## 3. 가격 범위 슬라이더

### 개요
데스크톱: 두 핸들 range 슬라이더로 교체 (네이티브 `<input type="range">` 2개 오버레이).  
모바일: 기존 칩 메뉴 유지, 파라미터 형식만 통일.

### URL 파라미터 변경

| 기존 | 변경 후 |
|---|---|
| `?price=lt5` | `?price_min=0&price_max=50000` |
| `?price=5to10` | `?price_min=50000&price_max=100000` |
| `?price=10to15` | `?price_min=100000&price_max=150000` |
| `?price=gt15` | `?price_min=150000&price_max=200000` |

- 단위: 만원
- `price_min`, `price_max` 둘 다 없으면 필터 미적용 (전체)

### 거래유형별 슬라이더 범위

| 거래유형 | 최솟값 | 최댓값 | 단위(step) |
|---|---|---|---|
| 매매 (sale) | 0 | 20억 (200,000만원) | 1억 (10,000만원) |
| 전세 (jeonse) | 0 | 10억 (100,000만원) | 5천만 (5,000만원) |
| 월세 보증금 (wolse) | 0 | 2억 (20,000만원) | 1천만 (1,000만원) |
| 전체 (all) | 0 | 20억 | 1억 |

거래유형 변경 시 슬라이더 범위 리셋 (price_min, price_max 파라미터 초기화).

### 컴포넌트 구조

**신규:** `app/(public)/list/_components/price-range-slider.tsx`
- `hidden md:block` (데스크톱 전용)
- props: `min`, `max`, `step`, `valueMin`, `valueMax`, `onChange`
- 네이티브 `<input type="range">` 2개 absolute 오버레이
- 선택 구간 강조 트랙: position 계산으로 `left` / `width` 동적 적용
- 핸들 겹침 방지: `minVal ≤ maxVal - step` 보장
- URL 업데이트 시점: `onMouseUp` / `onTouchEnd` (드래그 완료 후)
- 현재 선택 범위 텍스트 표시 (예: "3억 ~ 12억")

**수정:** `app/(public)/list/_components/list-filter-panel.tsx`
- 데스크톱: 가격 섹션을 `PriceRangeSlider`로 교체
- 모바일 칩: `price` 파라미터 → `price_min` / `price_max` 프리셋으로 변환
  - 5억이하 → `price_max=50000`
  - 5~10억 → `price_min=50000&price_max=100000`
  - 10~15억 → `price_min=100000&price_max=150000`
  - 15억이상 → `price_min=150000`

**수정:** `app/(public)/list/_components/mobile-filter-sheet.tsx`
- activeCount 계산에서 `price` → `price_min` / `price_max` 반영

**수정:** `lib/property.ts`
- `PriceRange` 타입 제거 또는 deprecated
- `getProperties()` 필터에 `priceMin?: number`, `priceMax?: number` 파라미터 추가
- Prisma where 조건: `dealAmount: { gte: priceMin, lte: priceMax }` (각각 undefined 허용)

**수정:** `app/(public)/list/page.tsx`
- `searchParams`에서 `price` 제거 → `price_min`, `price_max` 파싱
- `PropertyList`에 `priceMin`, `priceMax` props 전달

---

## 변경 파일 요약

| 파일 | 변경 유형 |
|---|---|
| `app/(public)/list/page.tsx` | 사이드바 max-h 추가 + price 파라미터 변경 |
| `app/(public)/_components/nav.tsx` | 지역 메뉴 제거 |
| `app/(public)/list/_components/list-filter-panel.tsx` | 가격 슬라이더 교체 |
| `app/(public)/list/_components/mobile-filter-sheet.tsx` | activeCount price 파라미터 변경 |
| `app/(public)/list/_components/price-range-slider.tsx` | 신규 생성 |
| `app/(public)/list/_components/property-list.tsx` | priceRange → priceMin/priceMax props 변경 |
| `lib/property.ts` | priceMin/priceMax 필터 파라미터 변경 |

---

## 범위 외 (이번 스펙 미포함)

- `/region/[code]` 페이지 개선 (오피스텔·연립다세대 섹션 등)
- 홈 페이지 지역 탐색 섹션
- 검색 UX 개선
