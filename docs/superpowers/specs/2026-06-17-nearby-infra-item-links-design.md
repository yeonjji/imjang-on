# 주변 생활 인프라 항목 → 시설 상세 페이지 링크

- 날짜: 2026-06-17
- 대상: 공용 `NearbyInfra` 컴포넌트(전 상세 페이지) — 실거래가(아파트·오피스텔·빌라), 청약, 생활편의(상권·urban·학교·병원·약국·어린이집)
- 레퍼런스: 바로 옆 `NearbyApartments`의 행-링크 패턴(`components/ui/nearby-apartments.tsx`), `docs/superpowers/specs/2026-06-03-hospital-pharmacy-nearby-infra-design.md`

## 배경

`NearbyInfra`(`components/ui/nearby-infra.tsx`)는 11개 상세 페이지에서 공유되는 단일 컴포넌트이고,
표시 데이터는 모두 `buildInfraCategories()`(`lib/amenity/infra.ts`) 한 곳에서 만들어진다.
현재 인프라 항목(병원·약국·마트·카페·공원·전통시장·충전소·주차장·어린이집·기타)은 **정적 표시**라 클릭해도 아무 일이 없다.

각 카테고리의 **개별 시설 상세 페이지는 이미 전부 존재**한다. 따라서 데이터 빌더에서 항목별 `href`를 계산하고,
컴포넌트에서 `href`가 있을 때 행을 `<Link>`로 감싸면 11개 페이지 전부에 한 번에 적용된다.
이는 바로 옆 `NearbyApartments`가 이미 쓰는 패턴(행 전체를 `<Link href={/apt/${id}}>`로 감쌈)과 동일하다.

## 카테고리 → 시설 상세 URL 매핑

10개 `InfraCategoryKey` 전부 상세 페이지가 존재한다.

| 키 | 라벨 | URL | 필요한 값 |
|---|---|---|---|
| `store` | 편의·마트 | `/amenity/mart/{id}` | id |
| `cafe` | 카페 | `/amenity/cafe/{id}` | id |
| `etc` | 기타 생활편의 | `/amenity/convenience/{id}` | id |
| `market` | 전통시장 | `/amenity/market/{id}` | id |
| `park` | 공원 | `/urban/park/{id}` | id |
| `parking` | 주차장 | `/urban/parking/{id}` | id |
| `charger` | 전기차 충전소 | `/urban/charger/{id}` | id |
| `hospital` | 병원 | `/medical/hospital/{sigunguCode}/{id}` | id + **sigunguCode** |
| `pharmacy` | 약국 | `/medical/pharmacy/{sigunguCode}/{id}` | id + **sigunguCode** |
| `childcare` | 어린이집 | `/childcare/{sigunguCode}/{id}` | id + sigunguCode |

### 검증된 라우팅 사실 (404 방지)

- amenity 어댑터 `mart`·`cafe`·`convenience`(Store), `market`(TraditionalMarket)의 `getById`는 **id-only `findUnique`**다.
  → 카테고리 슬러그가 행 industry와 정확히 일치하지 않아도 상세 페이지는 정상 로드된다.
  특히 `etc`(mart/cafe/medical 아닌 Store)는 `/amenity/convenience/{id}`로 보내면 어떤 Store든 로드됨(라벨만 "편의" 계열로 표기 — 사소한 표기 차이, 404 아님).
- urban `getUrbanById(slug, id)`, charger 상세 모두 id-only. urban 슬러그는 `parking`·`charger`·`park`로 확정.
- amenity·urban·charger 상세는 `/^\d+$/.test(id)`로 숫자 id를 검증한다. 우리 id는 `BigInt → String`이라 항상 숫자열. ✓
- **병원·약국·어린이집 상세는 `row.sigunguCode !== urlSigunguCode`이면 `notFound()`** 처리한다.
  → URL의 sigunguCode는 반드시 **행 자체의 `sigunguCode`를 그대로** 써야 한다(주소·지역에서 파생 금지). 본 설계는 행의 sigunguCode를 직접 사용하므로 충돌 없음.

## 변경 사항

### A. 공용 집계 — `lib/amenity/nearby.ts`

- `NearbyHospital` 인터페이스에 `sigunguCode: string | null` 추가, `getNearbyHospitals` 쿼리 SELECT에 `"sigunguCode"` 추가.
- `NearbyPharmacy` 인터페이스에 `sigunguCode: string | null` 추가, `getNearbyPharmacies` 쿼리 SELECT에 `"sigunguCode"` 추가.
  - 두 테이블 모두 `sigunguCode` 컬럼 보유(스키마 확인 완료).
- `NearbyChildcare`는 이미 `sigunguCode`를 SELECT하므로 변경 없음.
- 그 외 nearby 쿼리(store/market/park/parking/charger)는 변경 없음(URL이 id-only).

### B. 공용 순수 로직 — `lib/amenity/infra.ts`

- `InfraItem`에 `href: string | null` 추가.

  ```ts
  export interface InfraItem {
    id: string;
    name: string;
    sub: string | null;
    distanceMeters: number;
    href: string | null;
  }
  ```

- 순수 함수 `infraHref(key, id, sigunguCode?)` 신설. sigunguCode가 필요한데 없으면 `null` 반환.

  ```ts
  export function infraHref(
    key: InfraCategoryKey,
    id: string,
    sigunguCode?: string | null,
  ): string | null {
    switch (key) {
      case 'store':     return `/amenity/mart/${id}`;
      case 'cafe':      return `/amenity/cafe/${id}`;
      case 'etc':       return `/amenity/convenience/${id}`;
      case 'market':    return `/amenity/market/${id}`;
      case 'park':      return `/urban/park/${id}`;
      case 'parking':   return `/urban/parking/${id}`;
      case 'charger':   return `/urban/charger/${id}`;
      case 'hospital':  return sigunguCode ? `/medical/hospital/${sigunguCode}/${id}` : null;
      case 'pharmacy':  return sigunguCode ? `/medical/pharmacy/${sigunguCode}/${id}` : null;
      case 'childcare': return sigunguCode ? `/childcare/${sigunguCode}/${id}` : null;
    }
  }
  ```

- `buildInfraCategories(raw)`에서 각 항목 매핑 시 `href`를 세팅한다.
  - id-only 카테고리(store/cafe/etc/market/park/parking/charger): `infraHref(key, String(id))`.
  - hospital: `infraHref('hospital', String(h.id), h.sigunguCode)`.
  - pharmacy: `infraHref('pharmacy', String(p.id), p.sigunguCode)`.
  - childcare: `infraHref('childcare', String(c.id), c.sigunguCode)`.
  - 빈 카테고리 필터·`capped`·distanceMeters 정규화 등 기존 로직 불변. `href`는 string이라 Server→Client 직렬화 안전.

### C. 컴포넌트 — `components/ui/nearby-infra.tsx`

- `import Link from 'next/link'` 추가.
- `InfraBlock`의 각 `<li>` 렌더:
  - `it.href`가 있으면 행 내용을 `<Link href={it.href}>`로 감싸고, **우측 거리 배지 뒤에 화살표 `›`** 추가, **`hover:bg`로 은은한 배경 강조**(어포던스 — 사용자 선택).
  - `it.href`가 없으면(시군구 누락된 병원/약국 등) 현재처럼 정적 `<div>`로 렌더(비클릭).
- 호버 배경은 블록 배경(`--color-soft`)과 구분되도록 `--color-sky-soft` 계열의 옅은 톤 사용. 화살표는 `--color-muted`.
- `--shadow-soft` 외 그림자 추가 금지, 색은 정보 전달용(DESIGN 원칙 준수). 레이아웃·간격은 기존 유지, 링크화/호버/화살표만 가산.
- 카테고리당 화면 cap 5 + "더보기" 버튼 로직 불변(버튼은 `<li>` 바깥이라 링크와 무관).

## 엣지 케이스

- **sigunguCode 누락 병원/약국**: `href=null` → 해당 행만 비클릭. 404 없음, 나머지 행은 정상 링크.
- **자기 자신 제외**: 각 시설 상세는 이미 자기 id를 제외(`excludeHospitalId` 등)하므로 자기 자신으로의 링크는 발생하지 않음.
- **etc 상점의 라벨 표기**: `/amenity/convenience/{id}`에서 비편의 상점도 로드되나 breadcrumb/기본 라벨이 "편의" 계열로 보일 수 있음 — 표기상 사소, 404 아님. (본 작업 범위에서 별도 처리 안 함.)

## 테스트 — `tests/lib/`

- `infraHref` 순수 함수 매핑 테스트(신규, 예: `tests/lib/infra-href.test.ts` 또는 기존 `amenity-infra.test.ts` 확장):
  - 7개 id-only 키가 올바른 경로 생성.
  - hospital/pharmacy/childcare: sigunguCode 있으면 경로 생성, 없으면 `null`.
- `buildInfraCategories`가 각 항목에 `href`를 세팅하는지(특히 hospital/pharmacy/childcare가 raw row의 sigunguCode를 반영) 단언.

## 검증

1. `pnpm tsc --noEmit` + `pnpm lint` + `pnpm vitest run` 전체 통과.
2. 기존 e2e 회귀 무파손: `tests/e2e/apt-detail.spec.ts`, `tests/e2e/officetel-villa-infra.spec.ts`(텍스트 단언 위주라 링크 추가로 깨지지 않아야 함).
3. dev 서버 실데이터 수동 확인: 아파트 상세에서 병원 행 클릭 → `/medical/hospital/{sigunguCode}/{id}` 정상 이동(404 아님). 각 카테고리 1건씩 표본 클릭으로 경로 해석 확인.

## 비목표 (out of scope)

- `NearbyApartments`·`NearbySubway` 등 다른 공용 컴포넌트는 범위 아님(지하철은 상세 페이지 자체가 없음).
- 인프라 카테고리 추가/제거, 반경·정렬·cap 규칙 변경 없음.
- etc 상점의 amenity 카테고리 라벨 정합성 개선은 별도 작업.
