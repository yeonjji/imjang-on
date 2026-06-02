# 공원 목록·상세 화면 설계

**날짜**: 2026-06-02
**범위**: `/urban/park` 목록 페이지 + `/urban/park/[id]` 상세 페이지 (모바일 포함)

---

## 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 목록 레이아웃 | 주차장 패턴 (사이드바 필터 + 카드 목록) |
| 카드 디자인 | 텍스트 심플형 — 공원유형 배지 + 면적 배지 + 이름 + 주소 |
| 상세 섹션 | 기본정보·지도·주변아파트·주변편의시설·같은지역공원 전부 포함 |
| 모바일 필터 | 바텀시트 (시도 칩 + 공원유형 체크박스) |

---

## 1. 라우트 구조

```
/urban/park          → 목록 (생활편의 > 도시인프라 > 공원)
/urban/park/[id]     → 상세
```

- `life-menu.ts`에 이미 `href: '/urban/park'`로 정의되어 있음 (`live: false` → 구현 완료 후 `true`)
- 기존 `app/(public)/urban/[category]/page.tsx`와 `[category]/[id]/page.tsx`가 dynamic route로 커버
- `UrbanSlug`에 `'park'` 추가 필요

---

## 2. 데이터 레이어

### 2-1. `lib/urban/adapters/park.ts` (신규)

`charger.ts` 패턴을 따라 `parkDef: UrbanCategoryDef<ParkRaw>` 구현.

```ts
export type ParkRaw = Park; // Prisma 타입
```

| 메서드 | 구현 내용 |
|---|---|
| `getList(filter, page)` | `address LIKE '시도 전체명%'` 필터 + `parkType` sub-filter (`sub` param 재사용) |
| `getById(id)` | `prisma.park.findUnique` |
| `getLatLng(id)` | PostGIS `ST_X/ST_Y` raw query (parking 패턴 동일) |
| `inferRowSummary(item)` | 면적 포맷: `"415,466 ㎡"` (null이면 null) |
| `detailFields(item)` | `[{ label: '공원 유형', value }, { label: '면적', value: 'N ㎡' }]` |
| `renderRichSections(item)` | `<ParkInfo />` 컴포넌트 반환 |

**subFilters 설정** (`sub` param → `parkType` 필드 매핑):

```
전체 / 근린공원 / 어린이공원 / 체육공원 / 소공원 / 역사공원 / 묘지공원 / 문화공원
```

### 2-2. `lib/urban/category.ts` 변경

```ts
export type UrbanSlug = 'parking' | 'charger' | 'park'; // 'park' 추가
```

`parkDef` import 및 `URBAN_CATEGORIES`·`URBAN_SLUGS`에 등록.

---

## 3. 목록 페이지

### 레이아웃 (데스크탑)
기존 `[category]/page.tsx` **변경 없음** — `parkDef`를 카테고리 레지스트리에 등록하면 자동 작동.

- 왼쪽: 사이드바 필터 (`UrbanFilterPanel`) — 시도/시군구 + 공원유형 서브필터
- 오른쪽: 카드 목록 (`ParkCard`) + 페이지네이션

### ParkCard 컴포넌트 (신규)
`app/(public)/urban/[category]/_components/park-card.tsx`

```
[🌳 아이콘] [근린공원] [415,466 ㎡]
            보라매공원
            서울특별시 동작구 신대방동 395        상세 →
```

- `UrbanCard`에 `def.slug === 'park'` 분기를 추가해 `ParkCard` 렌더링
- 이모지는 parkType별 매핑 (근린·소공원: 🌳, 어린이: 🌿, 체육: 🏃, 역사: 🏛️, 나머지: 🌳)

### 모바일 목록
- 사이드바 숨김 (md 이상만 표시)
- 상단 필터 칩바: `[🔽 서울]` `[유형]` — 탭하면 바텀시트 열림
- 카드: 풀 width 1열, 배지 줄바꿈 허용
- 페이지네이션: 모바일에서도 동일하게 하단 표시

---

## 4. 상세 페이지

### 레이아웃 (데스크탑)
`lg:grid-cols-[1fr_320px]` — main + sidebar (주차장 상세와 동일 구조)

### Main 컨텐츠 (위→아래 순서)

| 섹션 | 컴포넌트 | 비고 |
|---|---|---|
| 히어로 | `UrbanHero` | 재사용 |
| 기본 정보 | `ParkInfo` (신규) | 공원유형·면적·주소 |
| 지도 | `NaverMap` | 좌표 없으면 "위치 정보 없음" 카드 |
| 주변 아파트 실거래가 | `NearbyApartments` | 재사용, 좌표 없으면 미표시 |
| 주변 편의시설 | `NearbyAmenitiesMixed` | 재사용, 좌표 없으면 미표시 |
| 같은 지역 다른 공원 | `UrbanSameCategoryNearby` 패턴 | `getSameCategoryNearbyPark` 신규 (`lib/urban/nearby.ts`에 추가) |

### Sidebar
`UrbanDetailSidebar` 재사용 — 같은 시군구 다른 공원 최대 4개.

### ParkInfo 컴포넌트 (신규)
`app/(public)/urban/[category]/_components/park-info.tsx`

```
┌─────────────────────────────────┐
│ 공원 정보                        │
│ 공원 유형   근린공원              │
│ 면적        415,466 ㎡           │
│ 주소        서울 동작구 신대방동… │
└─────────────────────────────────┘
```

### 상세 페이지 리팩터링 필요 사항
현재 `[id]/page.tsx`는 주차장 전용 컴포넌트(`ParkingHoursTable` 등)를 직접 import.
공원 추가 시 `def.renderRichSections(item)` 호출로 카테고리별 전용 섹션을 위임하도록 수정:

```tsx
// 기존 (주차장 전용 하드코딩)
<ParkingHoursTable row={r} />
<ParkingFeeGrid row={r} />
<ParkingExtras row={r} />

// 변경 후 (카테고리별 위임)
{def.renderRichSections(item)}
```

`getSameCategoryNearbyParking`과 같은 방식으로 `getSameCategoryNearbyPark(lat, lng, excludeId)` 함수를 `lib/urban/nearby.ts`에 추가. 상세 페이지에서 `def.slug`로 분기해 호출.

### 모바일 상세
- 사이드바(`aside`) 미표시 — 같은지역공원은 main 하단에 배치
- 히어로: 그린 그라데이션 배경, 이모지 + 공원명 + 유형배지
- 지도: 높이 240px (모바일) / 320px (데스크탑)
- 섹션 간격: `gap-6` 유지

---

## 5. 필터 바텀시트 (모바일)

기존 `UrbanMobileFilterSheet` 재사용. `parkDef`에 `subFilters`가 등록되면 자동으로 공원유형 탭이 바텀시트 안에 표시됨.

바텀시트 구성:
1. 시도 선택 (칩 형태)
2. 공원 유형 체크박스 (서브필터)
3. 초기화 / 적용하기 버튼

---

## 6. 신규 파일 목록

```
lib/urban/adapters/park.ts                          # parkDef 구현
app/(public)/urban/[category]/_components/
  park-card.tsx                                     # ParkCard 컴포넌트
  park-info.tsx                                     # 상세 기본정보 섹션
```

## 7. 수정 파일 목록

```
lib/urban/category.ts                               # 'park' slug 추가, parkDef 등록
app/(public)/urban/[category]/[id]/page.tsx         # renderRichSections 위임 리팩터링
app/(public)/_components/life-menu.ts               # park live: true
```

---

## 8. 제외 사항

- 운영시간·요금 정보 없음 (공원 데이터에 없음)
- 지도 없는 공원(좌표 null): 지도·주변정보 섹션 전체 미표시 (주차장과 동일 처리)
- 검색(q) 기능: `UrbanListFilter.q` 재사용, `name LIKE` 쿼리
