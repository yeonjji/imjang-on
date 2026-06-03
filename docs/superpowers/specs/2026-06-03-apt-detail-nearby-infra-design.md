# 실거래가(아파트) 상세 — 주변 생활 인프라 추가 설계

**작성일:** 2026-06-03
**상태:** 승인됨 (구현 대기)

## 배경 / 목표

아파트 실거래가 상세 페이지(`app/(public)/apt/[id]/page.tsx`)는 현재 가격 중심
섹션(요약·실거래 내역·그래프·면적 비교·주변 단지 비교)만 있고, 학교/병원/약국/상권·편의
/도시인프라 상세에 이미 적용된 **공용 "주변 생활 인프라"(`NearbyInfra`) 블록이 없다.**
사용자 요구: "지금 가지고 있는 주변 인프라 정보를 싹다 넣고, 페이지가 길고 정보가
많았으면 좋겠다(모바일 포함)."

목표: 이미 구축·검증된 `getNearbyInfra` + `NearbyInfra` 파이프라인을 실거래가 상세에
**그대로 재사용**해 주변 생활 인프라를 노출한다.

## 결정 사항 (브레인스토밍 합의)

- **범위:** 공용 `NearbyInfra` 전체 카테고리(편의·마트, 카페, 병원, 약국, 공원,
  전통시장, 전기차 충전소, 주차장, **어린이집**, 기타). 0곳 카테고리는 자동 숨김.
- **어린이집 포함:** 주거용 단지이므로 `includeChildcare: true` (병원 상세와 동일).
- **기존 "주변 단지 실거래가 비교"(`NearbyPriceComparison`)는 유지** — 그대로 둔다.
- **지도(NaverMap) 미포함**, **학교 블록 미포함** (현재 `getNearbyInfra` 미지원, 스코프 제외).
- **정보 밀도:** 카테고리별 기본 5개 + "더보기" — 다른 상세 페이지와 100% 동일.
- **배치:** `<main>`의 **맨 아래**, `NearbyPriceComparison` 다음.
- **사이드바 앵커 라벨:** "주변 생활 인프라" (`#poi`).

## 아키텍처

신규 컴포넌트·신규 UI 패턴 없음. 변경 지점 3곳:

### 1. 데이터 헬퍼 — `lib/property.ts`에 `getPropertyLatLng(id)` 추가

`getChildcareLatLng`(`lib/childcare.ts`)와 동일한 패턴. `getPropertyById`는 `include`
기반이라 geography 컬럼을 노출하지 않으므로 별도 raw 쿼리가 필요하다.

```ts
export async function getPropertyLatLng(
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Property" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}
```

### 2. 페이지 와이어링 — `app/(public)/apt/[id]/page.tsx`

- import: `getPropertyLatLng` (`@/lib/property`), `getNearbyInfra` (`@/lib/amenity/nearby`),
  `NearbyInfra` (`@/components/ui/nearby-infra`).
- 좌표 조회 후 `getNearbyInfra(lat, lng, { includeChildcare: true })`를 기존
  `Promise.all`에 합류. 좌표 조회는 infra 조회의 선행 조건이므로 다음 둘 중 하나:
  - (권장) `getPropertyLatLng`를 먼저 await한 뒤, 좌표가 있으면 나머지를 `Promise.all`에 포함.
  - 병원 상세와 동일하게 `coord ? getNearbyInfra(...) : Promise.resolve([])` 가드.
- 렌더: `<main>`의 마지막 자식으로 `{infra.length > 0 && <NearbyInfra categories={infra} />}`
  를 `<NearbyPriceComparison>` 다음에 배치.

좌표 처리 예:
```ts
const coord = await getPropertyLatLng(propId);
const [unified, chart, areaSummary, nearby, infra] = await Promise.all([
  getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
  getMonthlyChartData(propId),
  getAreaSummary(propId),
  getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
  coord
    ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
    : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
]);
```

### 3. 사이드바 앵커 — `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

`ANCHORS` 배열 끝에 추가:
```ts
{ href: '#poi', label: '주변 생활 인프라' },
```
`NearbyInfra`는 이미 `id="poi"`로 렌더되므로 별도 작업 불필요.

## 데이터 흐름

`page (server)` → `getPropertyLatLng` → `getNearbyInfra`(8개 PostGIS 반경 쿼리 병렬,
빈 카테고리 자동 제외) → 직렬화된 `InfraCategory[]` → `<NearbyInfra>` (client)가
칩 + 반응형 그리드 렌더.

## 모바일

공용 컴포넌트가 이미 처리: `grid-cols-1`(모바일) → `md:grid-cols-2`(데스크톱),
가로 스크롤 카테고리 칩, 블록별 "더보기" 확장. 추가 작업 없음.

## 에러 / 엣지 케이스

- 좌표 없음(`location` NULL) → `[]` 반환 → 블록 미렌더, 페이지 정상 동작.
- 모든 카테고리 0곳(주변에 데이터 없는 단지) → `NearbyInfra`가 `null` 반환 → 미렌더.
- 둘 다 다른 상세 페이지와 동일하게 graceful degrade.

## 검증

1. `pnpm build` / 타입체크 통과.
2. Playwright로 실제 아파트 상세 URL 데스크톱 + 모바일 스크린샷 QA
   (기존 `qa-*-desktop/mobile.png` 산출물과 동일 방식).

## 스코프 가드 (이번에 하지 않는 것)

- 지도(NaverMap) 미추가.
- 주변 학교 블록 미추가 (신규 쿼리 필요 → 별도 작업).
- 기존 실거래/그래프/면적/주변 단지 섹션 변경 없음.
- `NearbyInfra` 컴포넌트, `lib/amenity/infra.ts`, `lib/amenity/nearby.ts` 로직 변경 없음.
- officetel/villa 상세는 이번 범위 밖 (필요 시 동일 패턴으로 후속).
