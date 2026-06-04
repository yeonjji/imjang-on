# 좌표 커버리지·품질 보정 설계 (Coordinate Coverage & Quality)

- 작성일: 2026-06-04
- 범위: **C (전체 테이블 오좌표 교정 포함)**
- 상태: 설계 승인 → 구현 계획 작성 대기

## 1. 배경 / 문제

모든 장소성 데이터(매물·생활편의)를 지도에 표시하려면 각 행이 위경도 좌표를 가져야 한다. 처음엔 "지오코딩 API로 전량 좌표를 새로 만드는 대규모 작업"으로 인식했으나, 실측 결과 **이미 99.96%가 채워져 있다.**

### 운영 DB 실측 (2026-06-04, `.env.local` 읽기 전용 COUNT)

| 테이블 | 전체 | 좌표 NULL | NULL % |
|---|---:|---:|---:|
| Store | 311,857 | 0 | 0% |
| Property | 143,106 | 153 | 0.1% |
| EvCharger | 99,086 | 0 | 0% |
| Hospital | 79,562 | 7 | 0.0% |
| Pharmacy | 25,688 | 2 | 0.0% |
| Childcare | 25,102 | 10 | 0.0% |
| Parking | 17,739 | 141 | 0.8% |
| Park | 17,000 | 0 | 0% |
| School | 12,561 | 50 | 0.4% |
| TraditionalMarket | 1,393 | 8 | 0.6% |
| **합계** | **~1,053,000** | **371** | **0.04%** |

따라서 실제 과제는 "대규모 신규 지오코딩"이 아니라 **(1) NULL 371행 채우기 + (2) 이미 채워졌지만 잘못 찍힌 좌표 교정 + (3) 미래 NULL 재발 방지**이다.

## 2. 좌표 저장 방식 (전제)

- 모든 테이블은 lat/lng 분리 컬럼이 아니라 **단일 `location geography(Point,4326)`** (PostGIS, WGS84) 컬럼을 쓴다.
- Prisma에서는 `location Unsupported("geography(Point,4326)")?`.
- **쓰기**: `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` — 인자 순서 **(경도, 위도)**.
- **읽기**: 경도 `ST_X(location::geometry)`, 위도 `ST_Y(location::geometry)`.
- **거리**: `ST_DWithin(a.location, b.location, meters)` (geography라 미터 단위).

## 3. 기존 인프라 (재사용)

- `scripts/ingest/geocoder.ts` — 카카오 주소검색 지오코더. 인메모리 캐시, `buildGeocodeQuery(prefix, address)`로 시도/시군구 접두사를 붙여 동명(洞) 모호성 제거. 응답에 `region1`/`region2` 포함(검증용).
- `scripts/ingest/amenities/geocode-fill.ts` — `enrichWithGeocode(rows)`: 좌표 없는 행을 주소로 폴백 지오코딩. store·park·traditional-market·parking 어댑터가 이미 사용.
- `scripts/ops/regeocode-suspect-properties.ts` — Property 한정 의심좌표 탐지(NULL + 50m 시군구 충돌) + `--apply` 재지오코딩. DRY-RUN 기본.
- `.github/workflows/regeocode-properties.yml` — 위 스크립트를 `workflow_dispatch`(수동)로 실행. 시크릿(`DATABASE_URL`/`DIRECT_URL`/`KAKAO_REST_KEY`)이 운영 DB를 가리킨다.
- GIST 공간 인덱스: Property·School·Park·EvCharger·TraditionalMarket·Store·Childcare·Parking에 존재. **Hospital·Pharmacy는 없음.**

## 4. 좌표 빈틈 / 폴백 구멍 지도

| 소스 | 좌표 출처 | 지오코딩 폴백 | 비고 |
|---|---|---|---|
| School | ❌ 소스에 없음 | ✅ enrichWithGeocode | 100% 지오코딩 의존 |
| Store / Park / TraditionalMarket / Parking | ✅ 소스 | ✅ | |
| EvCharger | ✅ 소스 | ❌ **폴백 없음** | 미래 NULL 방치 |
| Childcare | ✅ 소스 | ❌ **폴백 없음** | 〃 |
| Hospital / Pharmacy | ✅ 소스 | ❌ **폴백 없음** (별도 ingest 스크립트) | 〃 |
| Property | 지오코딩 | ✅ matcher + ops | |

## 5. 설계

### 5.1 오좌표 검출 신호 (행정경계 폴리곤 불필요)

`Region` 테이블에 행정경계 폴리곤 지오메트리가 없으므로 "점이 해당 시군구 폴리곤 내부인가" 정밀 검사는 **불가/범위 밖**. 폴리곤 없이도 동작하는 3대 실용 신호로 검출한다:

1. **NULL** — `location IS NULL` (371행).
2. **bbox 이탈** — `ST_Y(location::geometry) NOT BETWEEN 33.0 AND 38.7` 또는 `ST_X(location::geometry) NOT BETWEEN 124.0 AND 132.0`. 위경도 뒤바뀜·0좌표·해외좌표·이상치를 한 번에 검출. 순수 범위 스캔이라 인덱스 불필요.
3. **시군구 충돌** — `sigunguCode`가 있고 좌표가 **지오코딩 파생**인 테이블(Property·School)에 한정. 50m 내에 다른 `sigunguCode` 행과 충돌 시 동명 오지오코딩 의심. `ST_DWithin` self-join이라 GIST 인덱스 필요(두 테이블 모두 보유).
   - 소스좌표 테이블에는 적용하지 않는다(시군구 충돌은 지오코딩 오류 신호이며, 정부 원본 좌표에는 부적합 + 대형 테이블 self-join 비용).

bbox 범위는 보수적으로 잡아(33.0–38.7 / 124.0–132.0) 도서·접경 정상 좌표를 오탐하지 않게 한다.

### 5.2 교정 방법

검출된 모든 의심행 → **주소로 재지오코딩**(`geocoder.ts` 재사용)하여 `location` 갱신. 우리가 가진 유일한 "정답 소스"가 주소이기 때문(소스좌표가 틀려도 주소는 대개 정상). 지오코딩 실패행은 변경 없이 로그만 남긴다.

### 5.3 산출물

1. **`scripts/ops/coord-quality.ts`** (신규, 통합 ops 스크립트)
   - 테이블 설정 배열: 각 항목 `{ table, addressExpr, prefixExpr, hasSigunguCollision }`.
     - Property: 접두사 `Region.fullName`(regionCode 조인), 시군구충돌 ✅
     - School: 접두사 `region` + sigunguCode, 시군구충돌 ✅
     - Hospital / Pharmacy / Childcare: 접두사 `sido`+`sigungu`, 충돌 ❌(bbox·NULL만)
     - TraditionalMarket: 접두사 sigunguCode→시군구명, 충돌 ❌
     - Parking: 접두사 없음(주소만), 충돌 ❌
     - Store / EvCharger / Park: 충돌 ❌, NULL 0이지만 bbox 검출 대상에는 포함
   - 검출: 테이블별 사유별(NULL / out_of_bbox / cross_sigungu) 집계 + 샘플 출력.
   - **DRY-RUN 기본**. `--apply`로 재지오코딩 갱신.
   - 옵션: `--table=<name>`, `--reason=<null|bbox|sigungu>`, `--limit=N`, 카카오 레이트리밋 `sleep(50ms)`.
   - 기존 `geocoder.ts`/`buildGeocodeQuery` 재사용. **새 npm 의존성 없음.**

2. **폴백 구멍 4개 메우기** — 다른 어댑터가 이미 쓰는 `enrichWithGeocode` 호출 추가:
   - `scripts/ingest/amenities/adapter-ev-charger.ts` — return 전 `enrichWithGeocode(all)`.
   - `scripts/ingest/amenities/adapter-childcare.ts` — return 전 `enrichWithGeocode(all)`.
   - `scripts/ingest-hospital.ts` — upsert 전 rows에 적용. 행 shape `{address, lat, lng}` 확인 후.
   - `scripts/ingest-pharmacy.ts` — 〃.

3. **`scripts/ops/coverage-audit.ts`** — 임시 → 정식 ops 스크립트로 커밋. 테이블별 total / NULL / bbox이탈 카운트 집계. 백필 전후 검증 + 향후 모니터링용.

4. **Hospital·Pharmacy GIST 인덱스 마이그레이션** (raw SQL)
   - `CREATE INDEX IF NOT EXISTS "Hospital_location_idx" ON "Hospital" USING GIST ("location");`
   - `CREATE INDEX IF NOT EXISTS "Pharmacy_location_idx" ON "Pharmacy" USING GIST ("location");`
   - cross-sigungu 대상은 아니지만 향후 거리쿼리 이득 + 인덱스 세트 완성. 저위험.

5. **`.github/workflows/coord-quality.yml`** (신규) — `regeocode-properties.yml` 일반화.
   - `workflow_dispatch` 입력: `apply`(false/true), `table`, `reason`, `limit`.
   - 동일 시크릿·러너 패턴, `timeout-minutes: 120`.
   - 기존 `regeocode-properties.yml`은 **보존**(삭제하지 않음). `coord-quality.ts`의 부분집합이 되며 추후 폐기 가능하다고 본문에 명시.

### 5.4 실행 순서

1. (필요 시) Hospital·Pharmacy GIST 인덱스 마이그레이션 배포.
2. `coord-quality.ts` **DRY-RUN** (Actions, `apply=false`) → 테이블·사유별 의심 건수 리포트로 규모 파악.
3. `coord-quality.ts` **`--apply`** (Actions, `apply=true`) → 재지오코딩. 첫 실행은 `limit` 작게(예: 50) 검증 권장.
4. `coverage-audit.ts` 재실행 → NULL·bbox이탈이 "지오코딩 불가 잔여"만 남고 급감 확인.
5. 폴백 4개 어댑터/ingest 수정 후 다음 인제스트 주기부터 NULL 자가치유.

## 6. 성능 / 비용

- **검출(DRY-RUN)**: bbox는 ~105만 행 범위 스캔(수초~1분). 시군구 충돌은 GIST 보유한 Property·School에서만 self-join. 전체 수초~2분.
- **교정(--apply)**: 행당 카카오 1콜 + 50ms. NULL 371만이면 ~40초. bbox·충돌 추가 시 의심건수 비례(수 분). 카카오 무료 쿼터(일 10만)·Actions 120분 타임아웃 모두 여유.
- 실행 위치: **GitHub Actions 수동 트리거**, 시크릿이 운영 DB를 가리킴(로컬 `.env.local` 실행 불필요).

## 7. 성공 기준

1. `coord-quality.ts --apply` 후 `coverage-audit.ts`에서 NULL·bbox이탈이 지오코딩 불가 잔여만 남는다.
2. 폴백 4개 추가 후 재인제스트 시 주소가 풀리는 행은 NULL을 남기지 않는다.
3. `pnpm typecheck` + `pnpm lint` 통과. 기존 ingest 테스트 회귀 없음.

## 8. 범위 밖 (명시)

- 행정경계 폴리곤 적재 및 "점-폴리곤 내부 포함" 정밀 검사 → 필요 시 별도 프로젝트.
- lat/lng 분리 컬럼 신설(YAGNI — 조회 시 `ST_X`/`ST_Y`로 충분).
- 좌표 기반 지도 UI 자체(이 설계는 데이터 정합성만 다룬다).

## 9. 검증 DB 정책 (예외 명시)

메모리상 "검증은 `.env.test`(로컬 docker)" 원칙이나, 본 작업은 **운영 데이터 보정**이므로 대상이 운영 Supabase다. 안전장치: ① DRY-RUN 선행, ② `--limit` 소량 검증, ③ Actions 수동 트리거(자동 스케줄 아님).
