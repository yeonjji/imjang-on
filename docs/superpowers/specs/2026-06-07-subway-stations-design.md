# 지하철역 데이터 적재 + 근처 지하철역 섹션 + 역세권 검색·필터 설계

작성일: 2026-06-07

## 1. 목표

도시철도역사 정보(`전체_도시철도역사정보_20260228.xlsx`, 1,099행)를 적재해 세 가지 기능을 추가한다.

1. **근처 지하철역 섹션** — 좌표가 있는 모든 상세페이지에서 `주변 생활 인프라` 섹션 **바로 위**에 노출.
2. **역세권 검색** — 기존 검색 자동완성에 🚇 지하철역을 추가, 선택 시 그 역 근처 단지 리스트로 이동.
3. **역세권 리스트 필터** — `/list`에서 지하철역으로 단지를 필터링.

"근처" 판단 반경은 **고정 800m**(도보 약 10분), 세 기능 모두 동일 적용.

## 2. 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| 데이터 모델 | **논리역 통합** — 역사명+근접좌표로 묶어 노선 배열 보유, 대표 좌표 1개 |
| 리스트 필터 공간쿼리 | **ID 프리필터** — PostGIS로 800m 내 `Property.id`만 뽑아 기존 `getPropertyList`에 `id in [...]` 주입 |
| 섹션 노출 범위 | 좌표가 있는 **모든 상세페이지** |
| 노선 뱃지 | 실제 한국 지하철 **노선색 번호 뱃지**, 환승역은 여러 개 |
| 도보 N분 | 표기 유지 (직선거리 ÷ 약 67m/분, 반올림) |
| 비역세권 fallback | 유지 — 800m 내 역 없으면 **가장 가까운 역 1개** 안내 |

## 3. 데이터 모델

### 3.1 신규 모델 `SubwayStation`

```prisma
model SubwayStation {
  id          BigInt                                @id @default(autoincrement())
  name        String                                @db.VarChar(60)   // 역사명
  nameNorm    String                                @db.VarChar(60)   // 검색용 정규화 (pg_trgm)
  lines       String[]                              @default([])      // ["3호선","8호선"] 정렬·중복제거
  operators   String[]                              @default([])      // 운영기관명 목록
  address     String?                               @db.VarChar(200)  // 대표 역사도로명주소
  isTransfer  Boolean                               @default(false)   // lines.length > 1
  location    Unsupported("geography(Point,4326)")?                   // 클러스터 대표 좌표(평균)
  dataStdDate DateTime?                             @db.Date          // 데이터기준일자(최신)
  sourceKey   String                                @unique @db.VarChar(80) // 클러스터 고유키(중복 적재 방지)
  updatedAt   DateTime                              @updatedAt

  @@index([nameNorm])
}
```

- GIST 인덱스는 raw SQL 마이그레이션으로 추가:
  `CREATE INDEX "SubwayStation_location_idx" ON "SubwayStation" USING GIST ("location");`
- `nameNorm` trigram 인덱스(자동완성용): `CREATE INDEX ... USING GIN ("nameNorm" gin_trgm_ops);`

### 3.2 엑셀 → 논리역 클러스터링

엑셀은 **노선별 1행**이라 환승역이 중복된다(예: 가락시장 = 3호선 행 + 8호선 행, 좌표 미세 차이). 적재 시 다음으로 통합한다.

1. `역사명`이 같은 행끼리 그룹핑.
2. 같은 이름 그룹 내에서 **상호 700m 이내** 행을 한 클러스터로 묶는다.
   - 환승역은 좌표 차 ~100m → 한 클러스터.
   - 동명이지만 물리적으로 먼 별개 역(다른 도시 등)은 분리.
3. 클러스터당 1개 `SubwayStation` 생성:
   - `name` = 역사명
   - `lines` = 클러스터 내 `노선명` distinct, 자연 정렬(숫자 호선 오름차순 → 기타 노선)
   - `operators` = `운영기관명` distinct
   - `location` = 클러스터 좌표 평균(centroid)
   - `address` = 대표 행의 `역사도로명주소`
   - `isTransfer` = `lines.length > 1`
   - `sourceKey` = `${name}__${round(centroidLat,4)}_${round(centroidLng,4)}`

### 3.3 적재 스크립트

`scripts/ingest-subway.ts` (기존 `scripts/ingest-pharmacy.ts`·`ingest-hospital.ts`와 동일한 독립 스크립트 패턴).

- `scripts/ingest/amenities/xlsx-parse.ts`의 `readXlsxRows()`로 시트 파싱.
- 위 클러스터링 수행 후 `sourceKey` 기준 upsert.
- 좌표는 엑셀에 이미 있으므로 **지오코딩 불필요**.
- `IngestionRun`에 `source="subway"`, `targetKey="stations"`로 실행 기록(기존 패턴 동일).
- 멱등성: 재실행 시 `sourceKey` upsert로 중복 없음.
- 입력 파일은 레포에 커밋된 `data/subway.xlsx`를 기본 경로로 읽는다(인자로 다른 경로 지정 가능). 정적·소용량 데이터라 레포에 동봉해 재실행·CI 재현이 가능하다.

## 4. 근처 지하철역 섹션

### 4.1 조회 함수 — `lib/subway/nearby.ts`

```ts
export interface NearbySubwayStation {
  id: string;
  name: string;
  lines: string[];
  isTransfer: boolean;
  distanceMeters: number;
}

// 800m 내, 가까운 순. 없으면 가장 가까운 1개를 fallback으로.
export async function getNearbySubwayStations(
  lat: number, lng: number,
): Promise<{ stations: NearbySubwayStation[]; fallback: boolean }>
```

- 1차: `ST_DWithin(location, point, 800)` → 가까운 순, 상한 8개.
- 결과 0건이면 fallback: 반경 제한 없이 `ORDER BY distance LIMIT 1` (단, 비현실적 거리 방지용 상한 5km).
- `lib/amenity/nearby.ts`의 raw 쿼리 패턴 그대로 따른다(`ROUND(ST_Distance(...))::int AS "distanceMeters"`).

### 4.2 컴포넌트 — `components/ui/nearby-subway.tsx`

`'use client'` 불필요(상태 없음) → 서버 컴포넌트. `NearbyInfra`와 동일한 `Card` 톤.

- props: `{ stations, fallback }`
- 헤더: `🚇 근처 지하철역` + (`반경 800m · 가까운 순` | fallback이면 `가장 가까운 역`)
- 요약 칩: 역 개수·최단거리 / 환승역 수 / 노선 수 (fallback 시 생략)
- 역 행: 노선색 번호 뱃지(환승역 다중) + 역명 + `환승` 라벨 + 노선명 텍스트 / 우측 거리 pill + `도보 N분`
- fallback이면 점선 안내 박스 + 가장 가까운 역 1줄.
- `stations`가 비고 fallback도 없으면(좌표 없음 등) `null` 반환(섹션 숨김) — `NearbyInfra`와 동일.

노선색 매핑은 `lib/subway/line-colors.ts`에 상수 테이블로 둔다. 매칭 실패 노선은 기본 회색 + 노선명 약어.

목업 참조: `.playwright-mcp/subway-section-mock.html` (CASE1 역세권 / CASE2 fallback).

### 4.3 상세페이지 연결

좌표(`lat/lng`)를 이미 구하는 상세페이지 전부에서 `getNearbySubwayStations`를 `Promise.all`에 추가하고, `<NearbySubway>`를 `<NearbyInfra>` **바로 위**에 렌더한다.

대상: `apt/[id]`, `officetel/[id]`, `villa/[id]`, `subscription/[id]`, `childcare/[sigunguCode]/[id]`, `medical/hospital/.../[id]`, `medical/pharmacy/.../[id]`, `school/[sigunguCode]/[id]`, `urban/[category]/[id]`, `urban/charger/[id]`, `amenity/[category]/[id]`.

각 페이지는 이미 `NearbyInfra`를 렌더하므로 좌표 확보 로직 재사용. 좌표 없으면 두 섹션 모두 미노출.

## 5. 역세권 검색 (자동완성)

### 5.1 `lib/search.ts` — `autocomplete()` 확장

반환 타입에 `stations` 추가:

```ts
stations: Array<{ id: string; name: string; lines: string[]; isTransfer: boolean }>
```

- `nameNorm` trigram + prefix 매칭(Property 자동완성과 동일 패턴), `LIMIT 5`.
- `/api/search`는 `autocomplete()` 결과를 그대로 흘려보내므로 라우트 변경 없음(반환 필드만 증가).

### 5.2 검색 UI — `app/(public)/_components/search-input.tsx`

- 드롭다운에 `🚇 지하철역` 그룹 추가(단지·지역 그룹과 동일 스타일). 각 항목: 역명 + 노선 뱃지.
- 선택 시 `/list?station=<id>`로 이동.

## 6. 역세권 리스트 필터

### 6.1 파라미터 — `lib/list-params.ts`

`ListSearchParams.station?: string`, `ParsedListParams.stationId?: string` 추가. `parseListParams`에서 패스스루.

### 6.2 쿼리 — `lib/property.ts` `getPropertyList`

`PropertyListParams`에 `stationId?: string` 추가. 존재 시:

1. PostGIS 프리필터:
   ```sql
   SELECT p.id FROM "Property" p, "SubwayStation" s
   WHERE s.id = $stationId
     AND p.location IS NOT NULL
     AND ST_DWithin(p.location, s.location, 800)
   LIMIT 3000
   ```
2. 얻은 id 배열을 `where.id = { in: ids }`로 주입(기존 deal/price/area/정렬/페이징 그대로 적용).
3. id 0건이면 빈 결과 즉시 반환(추가 쿼리 생략).

- 상한 3000은 도심 최밀집역 안전마진(역당 단지 수는 통상 수백). 상한 초과는 사실상 없음.
- 정렬·가격·면적·딜타입 필터와 **AND 결합**된다.

### 6.3 `/api/list` 라우트

`parseListParams` 결과의 `stationId`를 `getPropertyList`에 전달(한 줄 추가).

### 6.4 필터 UI

- `list-filter-panel.tsx`(데스크톱) + `mobile-filter-sheet.tsx`(모바일)에 **지하철역 자동완성 입력** 추가.
  - 입력 시 `/api/search` 재사용(stations만 사용) 또는 경량 `/api/subway/search`(택1, 구현 단계 결정 — 기본은 `/api/search` 재사용).
  - 선택된 역은 제거 가능한 칩(`🚇 가락시장 ✕`)으로 표시, URL `station` 파라미터와 동기화.
- `/list` 헤더/요약에 활성 시 `🚇 OO역 800m 이내` 라벨 노출(기존 필터 요약 패턴 따름).

## 7. 마이그레이션

신규 마이그레이션 1개:
1. `SubwayStation` 테이블 생성(Prisma).
2. raw SQL: `location` GIST 인덱스 + `nameNorm` GIN trgm 인덱스.

검증은 `.env.test`(로컬 docker)로 수행 후 운영 반영.

## 8. 비범위 (YAGNI)

- 실제 도보 경로/보행자 네트워크 거리(직선거리만 사용).
- 출구별 좌표, 시간표/혼잡도, 노선도 그래픽.
- 사용자 선택형 반경(고정 800m).
- 역↔단지 사전계산 매핑테이블(2-C 방식 — 현 단계 불필요).
- 지도 위 역 마커 표시.

## 9. 작업 순서 (verify 포함)

1. Prisma 모델 + 마이그레이션 + GIST/GIN 인덱스 → verify: `.env.test` migrate 성공.
2. `scripts/ingest-subway.ts` 클러스터링·upsert → verify: 적재 후 환승역(가락시장 등)이 1행+lines 2개로 통합되는지 쿼리 확인.
3. `lib/subway/nearby.ts` + `line-colors.ts` → verify: 단위 테스트(좌표 입력 시 800m 결과·fallback 분기).
4. `components/ui/nearby-subway.tsx` → verify: 목업과 비주얼 일치.
5. 상세페이지 11곳에 섹션 연결 → verify: 대표 페이지 스크린샷.
6. `autocomplete()` + 검색 UI 역 그룹 → verify: 역명 입력 시 역 노출·이동.
7. 리스트 필터(파라미터→쿼리→UI) → verify: 역 선택 시 800m 내 단지만, 다른 필터와 AND.
8. e2e 스모크(검색→역 선택→리스트 필터 동작).
