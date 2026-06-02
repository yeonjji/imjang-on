# 학교 상세 — "주변 생활 인프라" 섹션 재설계

- 작성일: 2026-06-02
- 대상: `app/(public)/school/[sigunguCode]/[id]` 상세 페이지의 "주변 생활 인프라" 섹션
- 범위: **학교 상세 한 페이지에만** 우선 적용. (병원·약국·amenity 등 다른 상세는 이 패턴 검증 후 별도 작업)

## 1. 배경 / 문제

현재 학교 상세의 주변 인프라는 **탭 방식**(`nearby-amenities.tsx`)으로, 공원 / 마트·편의 / 충전소 3개만 노출한다. 문제:

1. 탭 전환이 번거롭고 한 번에 보이는 정보량이 적다.
2. 데이터가 없는 탭은 "정보가 없습니다" 빈 화면처럼 보인다.
3. 접힌 탭 콘텐츠라 SEO 노출량이 부족하다.
4. DB에는 병원·약국·전통시장·주차장·기타 생활편의 데이터가 이미 있으나 화면에 안 나온다.
5. 상세마다 카테고리별 개수가 달라 카드 높이·섹션 크기가 제각각이라 UI가 깨져 보인다.

## 2. 목표

- 탭 제거 → **카테고리별 섹션을 한 화면에 나열**.
- DB가 보유한 인프라 카테고리를 최대한 노출(편의·마트, 병원, 약국, 공원, 전통시장, 전기차 충전소, 주차장, 기타 생활편의).
- 데이터 개수가 0이든 많든 **UI가 깨지지 않게** 한다.
- 모바일에서 자연스럽고, SEO 친화적(콘텐츠 펼쳐진 상태)이며, 애드센스 영역과 시각적으로 충돌하지 않게 한다.

## 3. 최종 디자인 (승인됨)

### 3.1 레이아웃 — "균일 그리드 + 요약줄" (브레인스토밍 A안 + 요약줄)

```
주변 생활 인프라  · 반경 500m~1km
────────────────────────────────────────
[요약 배지줄]  🛒 편의·마트 12·80m   🏥 병원 8·180m   💊 약국 1·120m  …(가로 스크롤)
────────────────────────────────────────
┌── 블록(카테고리) ──┐  ┌── 블록(카테고리) ──┐
│ 🛒 편의·마트  12곳  │  │ 🏥 병원  8곳        │   ← 데스크탑 2열
│  · GS25 대치점 80m │  │  · 대치내과 180m    │      모바일 1열
│  · 이마트24   220m │  │  · …                │
│  …(최대 5)         │  │  +5곳 더보기 →      │
│  +7곳 더보기 →     │  │                     │
└────────────────────┘  └─────────────────────┘
```

- 상단에 **생활권 요약 배지줄**: 노출되는 카테고리마다 `아이콘 라벨 개수·최단거리` 칩 1개. 데스크탑은 wrap, 모바일은 가로 스크롤. 데이터가 적은 상세에서 허전함을 막고 한눈에 파악하게 한다.
- 본문은 **균일한 카테고리 블록의 2열 그리드**(`grid-cols-1 md:grid-cols-2`), 블록 스타일은 모두 동일.

### 3.2 카테고리 순서 (고정)

편의·마트 → 병원 → 약국 → 공원 → 전통시장 → 전기차 충전소 → 주차장 → 기타 생활편의

> 주변 아파트·어린이집은 지금처럼 **별도 섹션 컴포넌트**로 유지(이번 작업 범위 밖).

### 3.3 개수 처리 규칙

- **cap = 5**: 카테고리당 최대 5곳까지 노출(가까운 순). 데이터가 1곳이면 1곳만 — 최소 개수로 깎지 않는다.
- **더보기**: cap 초과 시 `+N곳 더보기` 버튼. 클릭하면 같은 블록 안에서 나머지를 펼친다(인라인 toggle). 펼침 한도는 fetch 한도(아래)와 동일.
- **0곳 카테고리는 블록을 렌더하지 않는다**(요약줄에도 미포함). "없습니다" 빈 박스를 만들지 않는다.

### 3.4 높이 깨짐 방지

- 그리드에 `auto-rows-fr`(Tailwind `grid-rows`가 아니라 `[grid-auto-rows:1fr]`) 적용 → 같은 행에 놓인 두 블록 높이가 더 긴 쪽에 맞춰 자동 일치.
- 블록은 `flex flex-col`, 더보기/안내문구는 `mt-auto`로 하단 고정 → 1곳짜리 블록도 위로 찌그러지지 않음.
- 항목 1줄은 `이름(진한색) + 보조정보(회색) / 거리 배지(우측, flex-shrink-0)` 구조.

### 3.5 가독성 / 스타일 토큰

- 항목 이름: `text-[var(--color-text)]`(#172033) `font-semibold` — 회색 금지.
- 보조정보(업종/주소/면적 등): `text-[var(--color-muted)] text-xs`.
- 거리 배지: `bg-[var(--color-sky-soft)] text-[var(--color-blue)] font-bold rounded-full` 우측 정렬.
- 블록 배경 `--color-soft`, 테두리 `--color-line`, 라운드 `rounded-2xl`. 바깥 `Card` 래퍼 재사용(`id="poi"` 유지 — 사이드바 TOC 앵커가 `#poi`를 가리킴).

### 3.6 모바일 규칙

- 그리드 1열(`grid-cols-1`).
- 요약줄 가로 스크롤(`overflow-x-auto`, 칩 `flex-shrink-0`, `whitespace-nowrap`).
- 행 세로 패딩 확대(터치 영역), 이름+거리 한 줄 정렬 유지, 카드 폭 100%.

## 4. 데이터 계층

### 4.1 카테고리별 쿼리 (대부분 기존 함수 재사용)

`lib/amenity/nearby.ts`에 이미 존재:
- 편의·마트 / 기타: `getNearbyStores(lat, lng, 500)` — `industryCode`로 분류.
- 병원: `getNearbyHospitals(lat, lng, 500)`
- 약국: `getNearbyPharmacies(lat, lng, 500)`
- 공원: `getNearbyParks(lat, lng, 1000)`
- 전통시장: `getNearbyTraditionalMarkets(lat, lng, 1000)`
- 전기차 충전소: `getNearbyEvChargers(lat, lng, 500)`

신규 추가:
- 주차장: `getNearbyParking(lat, lng, 500)` — `Parking` 테이블에서 `name`, `prkplceSe`(공영/민영), `prkcmprt`(면수), `distanceMeters`. (urban/nearby.ts에 유사 쿼리가 있으나 excludeId 시그니처라, amenity 계열과 일관되게 별도 함수 추가.)

> fetch 한도(LIMIT): 카테고리당 **최대 12** 로 통일(현재 5~10 혼재). 5는 화면에 노출, 나머지는 더보기로 펼침. 개수 배지는 fetch된 개수 기준이며 12에 도달하면 `12+`로 표기.

### 4.2 분류 규칙 (Store)

- 편의·마트: `industryCode` prefix `G20405`(편의점) / `G20404` / `G20402`(마트·슈퍼).
- 기타 생활편의: 위에 속하지 않는 나머지 Store 항목(카페 등 포함).

### 4.3 집계 함수

기존 `getSchoolNearbyAmenities`를 **`getSchoolNearbyInfra(lat, lng)`** 로 대체(또는 신설). 위 카테고리들을 `Promise.all`로 모아 **정규화된 배열**로 반환:

```ts
type InfraItem = { id: string; name: string; sub: string | null; distanceMeters: number };
type InfraCategory = {
  key: 'store' | 'hospital' | 'pharmacy' | 'park' | 'market' | 'charger' | 'parking' | 'etc';
  label: string;       // '편의·마트'
  icon: string;        // '🛒'
  radiusLabel: string; // '반경 500m 내'
  items: InfraItem[];  // 가까운 순, 최대 12
};
```

- `id`는 직렬화 위해 `string`으로 변환(bigint 그대로 클라이언트 전달 금지).
- 빈 카테고리(`items.length === 0`)는 배열에서 제외하고 반환.
- `sub` 매핑: 편의·마트/기타=업종명, 병원=진료과/종별, 약국=주소, 공원=`parkType · 면적㎡`, 전통시장=시장유형, 충전소=`속도 · N기`, 주차장=`구분 · N면`.

## 5. 컴포넌트 구조

- **`nearby-amenities.tsx` 제거**, **`nearby-infra.tsx` 신설**(client component — 더보기 toggle에 `useState` 필요).
  - props: `categories: InfraCategory[]`.
  - 렌더: `Card#poi` 래퍼 → 제목 → 요약 배지줄 → `auto-rows-fr` 그리드 → 카테고리 블록.
  - 블록: 더보기 펼침 상태를 `key`별로 관리(`Set<string>` 또는 카테고리별 로컬 상태).
- 페이지(`page.tsx`): `getSchoolNearbyAmenities` 호출부를 `getSchoolNearbyInfra`로 교체, `<NearbyAmenities .../>` → `<NearbyInfra categories={...} />`. 좌표 없으면 미렌더(기존과 동일).

## 6. SEO / 광고

- 모든 카테고리 콘텐츠가 **펼쳐진 채(서버 렌더)** 출력 — 더보기 너머 항목만 클라이언트 토글이며 초기 5개 + 요약은 SSR/ISR 결과물에 포함.
- 섹션은 `Card` 단위로 광고 영역(사이드바 `--color`)과 분리 — 본문 그리드와 우측 광고가 시각적으로 충돌하지 않음.

## 7. 범위 밖 (Out of scope)

- 병원/약국/amenity/officetel 등 **다른 상세 페이지** 적용.
- 지도 위 POI 표시, 카테고리별 전용 목록 페이지 링크.
- 주변 아파트·어린이집 섹션 변경.

## 8. 성공 기준

1. 학교 상세에서 탭이 사라지고, 데이터가 있는 카테고리가 요약줄 + 균일 그리드로 노출된다.
2. 0곳 카테고리는 블록/배지 모두 미노출(빈 박스 없음).
3. 한 카테고리 1곳 + 다른 카테고리 5곳 이상이어도 같은 행 블록 높이가 일치(ragged 없음).
4. cap 5 초과 카테고리에서 `더보기`로 나머지가 펼쳐진다.
5. 375px 모바일에서 1열 + 요약줄 가로 스크롤로 깨짐 없이 표시된다.
6. 항목 이름이 진한색으로 또렷하게 보인다.
7. `pnpm lint` / `tsc --noEmit` 통과.
