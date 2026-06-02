# 병원 상세페이지 설계 스펙

Date: 2026-06-02

## 범위

- 병원 목록 페이지 (`/medical/hospital`, `/medical/hospital/[sigunguCode]`)
- 병원 상세 페이지 (`/medical/hospital/[sigunguCode]/[id]`)
- 약국은 이번 범위 제외 (live: false 유지)

## URL 구조

```
/medical/hospital                           → 병원 목록 (전국)
/medical/hospital?region=[sigunguCode]      → 지역 필터 목록
/medical/hospital/[sigunguCode]/[id]        → 병원 상세
```

`life-menu.ts` 업데이트:
- `병원·의원` href → `/medical/hospital`, live: true

---

## 목록 페이지

### 필터
- **지역**: sido → sigungu 2단계 드롭다운 (기존 school 패턴과 동일)
- **병원종류**: typeCode 기준 (상급종합병원 / 종합병원 / 병원 / 의원 / 요양병원 등)

### 카드 표시 항목
- 병원명, typeName 배지, 주소, 전화번호
- 전문의 수, 병상 수 (null이면 숨김)
- 오늘 진료시간 (HospitalDetail.openMon~openSun 기준, 없으면 "-")

### 렌더링
- ISR revalidate: 86400
- 페이지네이션: 20개/페이지

---

## 상세 페이지

### 레이아웃 구조

```
[Breadcrumb]
[Hero]
[요약 카드 (5개)]
[2컬럼: main(1fr) + sidebar(320px)]
  main:
    [탭 영역 — 병원 고유 데이터]
    [지도]
    [주변인프라 — 2열 그리드]
  sidebar:
    [같은 지역 병원 목록]
```

모바일: 2컬럼 → 단열, sidebar는 main 아래로

---

### Hero

- 병원명 (대형), typeName 배지, sido/sigungu, openedAt
- 전화번호 (모바일: tel: 링크), 홈페이지 링크

### 요약 카드 (5개, 항상 노출)

| 카드 | 데이터 출처 | null 처리 |
|------|-------------|-----------|
| 👨‍⚕️ 전문의 N명 | `Hospital.totalDoctors` | 없으면 숨김 |
| 🛏 병상 N개 | `HospitalFacility.generalBedPremium + generalBedNormal` | 없으면 숨김 |
| 🚑 응급실 운영 여부 | `HospitalDetail.erDayOpen` | 없으면 숨김 |
| 🚗 주차 N대 | `HospitalDetail.parkingCapacity` | 없으면 숨김 |
| 🕐 오늘 진료시간 | `HospitalDetail.openMon~openSun` props로 전달, **요일 계산은 클라이언트** | 없으면 "확인 필요" |

---

### 탭 영역 (병원 고유 데이터, 3탭)

탭은 client 컴포넌트. 데이터는 page.tsx에서 server-side fetch 후 props로 전달.

#### 탭 1 — 진료정보

- **진료과목** (`HospitalDept[]`): 과명 + 전문의수 그리드. 없으면 섹션 숨김.
- **의료진 구성** (`HospitalStaff[]`): 직종별 인원 태그. 없으면 섹션 숨김.
- **특수클리닉** (`HospitalSpecialty[]`): 태그 나열. 없으면 섹션 숨김.
- **특수치료** (`HospitalSpecialTreatment[]`): 태그 나열. 없으면 섹션 숨김.
- **간호등급** (`HospitalNursingGrade[]`): 병동 종류별 등급. 없으면 섹션 숨김.

탭 1 내 섹션이 모두 없으면 "진료 정보가 등록되어 있지 않습니다" 안내.

#### 탭 2 — 시설·장비

- **병상 현황** (`HospitalFacility`): 종류별 병상 수 테이블 (일반·상급/일반, ICU 성인·소아·신생아, 분만실, 수술실, 응급실, 격리실 등). null인 항목은 행 제외.
- **설립구분** (`HospitalFacility.foundTypeName`): 공공/민간 등.
- **의료장비** (`HospitalEquipment[]`): 장비명 + 대수 리스트. 없으면 섹션 숨김.
- **식대가산** (`HospitalMealSurcharge[]`): 있으면 표시. 없으면 섹션 숨김.

#### 탭 3 — 운영·교통

- **요일별 진료시간** (`HospitalDetail`): 월~일 7행 테이블. openXxx/closeXxx → "HH:MM ~ HH:MM" 포맷 (1030 → "10:30"). null이면 "휴진".
  - closedSunday/closedHoliday 있으면 주석으로 표시.
- **응급실** (`HospitalDetail.erDayOpen/erNightOpen`): 주간/야간 운영 여부 + 전화번호.
- **점심·접수 시간** (`HospitalDetail.lunchWeekday/lunchSaturday, receptionWeekday/receptionSaturday`).
- **주차** (`HospitalDetail.parkingCapacity/parkingFee/parkingNote`).
- **교통편** (`HospitalTransit[]`): 노선별 정류장·방향·거리 리스트. 없으면 섹션 숨김.

---

### 지도

기존 `NaverMap` 컴포넌트 그대로 사용. `Hospital.location` geography에서 lat/lng 추출 (ST_Y/ST_X raw query).

---

### 주변인프라 (탭 밖 별도 섹션)

2열 그리드 (데스크탑), 단열 (모바일 `md:grid-cols-2`).

각 카테고리는 별도 카드. 데이터 없으면 카드 자체 숨김.

| 카드 | 반경 | 최대 | 데이터 소스 |
|------|------|------|------------|
| 🏢 주변 아파트 | 1000m | 5개 | `getNearbyApartments()` (기존) |
| 💊 주변 약국 | 500m | 5개 | `Pharmacy` 테이블, 신규 쿼리 |
| 🌳 주변 공원 | 1000m | 5개 | `getNearbyParks()` (기존) |
| 🛒 편의점·마트 | 500m | 5개 | `getNearbyStores()` (기존) |
| ⚡ 전기차 충전소 | 500m | 5개 | `getNearbyEvChargers()` (기존) |

각 카드: 이름 + 거리(m) 리스트. 주변 약국은 신규 `getNearbyPharmacies()` 함수 추가 필요.

---

### 사이드바

같은 sigunguCode의 다른 병원 최대 4개 링크 목록 (병원명 + typeName).

---

## 데이터 페칭 전략

```ts
// page.tsx에서 병렬 fetch
const [hospital, coord] = await Promise.all([
  getHospitalById(id),       // Hospital + 모든 relations include
  getHospitalLatLng(id),
]);

const [apts, pharmacies, parks, stores, chargers, otherList] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : [],
  coord ? getNearbyPharmacies(coord.lat, coord.lng) : [],
  coord ? getNearbyParks(coord.lat, coord.lng) : [],
  coord ? getNearbyStores(coord.lat, coord.lng) : [],
  coord ? getNearbyEvChargers(coord.lat, coord.lng) : [],
  getHospitalList({ sigunguCode }, 1),
]);
```

`getHospitalById`는 Prisma `include`로 모든 relation을 한 번에 가져옴 (N+1 방지).

---

## 렌더링 전략

- ISR `revalidate: 86400` (학교·amenity 동일)
- 탭 컴포넌트만 `'use client'`, 나머지 server component
- `generateStaticParams`: 데이터 건수가 많으므로 **미적용** (on-demand ISR)

---

## 파일 구조

```
app/(public)/medical/
  hospital/
    page.tsx                          # 목록
    [sigunguCode]/
      page.tsx                        # 지역 필터 목록
      [id]/
        page.tsx                      # 상세
        _components/
          hospital-hero.tsx
          hospital-summary-cards.tsx
          hospital-tabs.tsx           # 'use client' — 3탭
          hospital-tab-diagnosis.tsx  # 진료정보 탭 내용
          hospital-tab-facility.tsx   # 시설·장비 탭 내용
          hospital-tab-operation.tsx  # 운영·교통 탭 내용
          hospital-nearby.tsx         # 주변인프라 2열 그리드
          hospital-sidebar.tsx
lib/
  hospital/
    index.ts     # getHospitalById, getHospitalList, getHospitalLatLng
  amenity/
    nearby.ts    # getNearbyPharmacies() 추가
```

---

## life-menu.ts 수정

```ts
{ label: '병원·의원', href: '/medical/hospital', live: true },
```

---

## 미결 사항

- 없음
