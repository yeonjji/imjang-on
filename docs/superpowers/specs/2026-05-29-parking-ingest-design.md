# 주차장 데이터 수집 설계

**날짜**: 2026-05-29
**범위**: 전국주차장정보표준데이터 수집 (수집·적재만, UI 노출 제외)

---

## 목표

전국 주차장 표준데이터를 공공데이터포털 XML API에서 수집해 DB에 적재한다.
기존 amenity ingest 패턴(`adapter-park`와 동일 형태)을 그대로 따른다.

이번 단계의 산출물은 **DB 적재까지**다. LIST/DETAIL 페이지, 단지 상세의
"주변 주차장" 카드, 지도 레이어, sigunguCode 매핑 backfill은 비범위.

---

## API

- Endpoint: `https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api`
- 인증: `serviceKey` = `PUBLIC_DATA_KEY` (이미 secrets 등록)
- 페이지네이션: `pageNo` / `numOfRows` (PAGE_SIZE = 1000)
- 응답: XML (`response > body > items > item`)
- 데이터 규모: `totalCount ≈ 18,527` (실측, 2026-05-29 기준)
- 갱신 주기: 월 1회 충분 (표준데이터 갱신 빈도가 낮음)

응답 1건 발췌(주요 필드):

| API 필드 | 의미 | 예시 |
|---|---|---|
| `prkplceNo` | 주차장 관리번호 (sourceId) | `355-2-000029` |
| `prkplceNm` | 주차장명 | `산동우항공원 공영주차장` |
| `prkplceSe` | 운영 구분 | `공영` / `민영` |
| `prkplceType` | 형태 | `노외` / `노상` |
| `rdnmadr` / `lnmadr` | 도로명/지번 주소 | — |
| `prkcmprt` | 주차구획수 | `233` |
| `feedingSe` | 급지 코드 | `1` / `2` / … |
| `enforceSe` | 요일제 | `5부제` / `미시행` |
| `operDay` | 운영요일 | `평일+토요일+공휴일` |
| `weekdayOperOpenHhmm` / `weekdayOperColseHhmm` | 평일 운영시간 | `00:00` / `23:59` |
| `satOperOperOpenHhmm` / `satOperCloseHhmm` | 토요일 운영시간 | — |
| `holidayOperOpenHhmm` / `holidayCloseOpenHhmm` | 공휴일 운영시간 | — |
| `parkingchrgeInfo` | 유무료 | `유료` / `무료` |
| `basicTime` / `basicCharge` | 기본 시간(분)/요금(원) | `30` / `300` |
| `addUnitTime` / `addUnitCharge` | 추가 단위시간(분)/요금(원) | `10` / `100` |
| `dayCmmtkt` / `monthCmmtkt` | 일일권/월정기권 (원) | `3000` / `0` |
| `metpay` | 결제수단 | `신용카드` |
| `spcmnt` | 특이사항 (장문) | — |
| `pwdbsPpkZoneYn` | 장애인 전용 여부 | `Y` / `N` |
| `institutionNm` / `phoneNumber` | 운영기관/연락처 | `구미도시공사 주차시설팀` / `054-…` |
| `insttCode` / `insttNm` | 데이터 제공 기관 | `B555076` / `구미도시공사` |
| `latitude` / `longitude` | 좌표 | `36.15387449` / `128.4316946` |
| `referenceDate` | 데이터 기준일 | `2026-04-17` |

좌표가 응답에 직접 포함되므로 별도 지오코딩 호출은 기본적으로 불필요하다.
누락분만 기존 `enrichWithGeocode`로 보완한다 (park와 동일).

---

## 스키마

```prisma
model Parking {
  id           BigInt   @id @default(autoincrement())
  sourceId     String   @unique @db.VarChar(40)   // prkplceNo

  name         String   @db.VarChar(150)
  prkplceSe    String?  @db.VarChar(10)           // 공영/민영
  prkplceType  String?  @db.VarChar(10)           // 노외/노상

  rdnmadr      String?  @db.VarChar(200)
  lnmadr       String?  @db.VarChar(200)
  address      String   @db.VarChar(200)          // rdnmadr || lnmadr
  location     Unsupported("geography(Point,4326)")?

  prkcmprt     Int?                               // 주차구획수
  feedingSe    String?  @db.VarChar(4)
  enforceSe    String?  @db.VarChar(20)

  operDay              String? @db.VarChar(60)
  weekdayOpenHhmm      String? @db.VarChar(5)
  weekdayCloseHhmm     String? @db.VarChar(5)
  satOpenHhmm          String? @db.VarChar(5)
  satCloseHhmm         String? @db.VarChar(5)
  holidayOpenHhmm      String? @db.VarChar(5)
  holidayCloseHhmm     String? @db.VarChar(5)

  chargeInfo    String? @db.VarChar(10)           // 유료/무료
  basicTime     Int?
  basicCharge   Int?
  addUnitTime   Int?
  addUnitCharge Int?
  dayCmmtkt     Int?
  monthCmmtkt   Int?
  metpay        String? @db.VarChar(60)
  spcmnt        String? @db.Text

  pwdbsPpkZoneYn Boolean?
  institutionNm  String? @db.VarChar(80)
  phoneNumber    String? @db.VarChar(30)
  insttCode      String? @db.VarChar(10)
  insttNm        String? @db.VarChar(80)
  referenceDate  DateTime? @db.Date

  updatedAt    DateTime @updatedAt

  @@index([prkplceSe])
  @@index([chargeInfo])
}
```

- PK: `BigInt` autoincrement — 기존 amenity 모델과 동일
- `sourceId = prkplceNo` UNIQUE — `ON CONFLICT` upsert 키
- `location`: PostGIS `geography(Point,4326)`. Prisma가 컬럼을 직접 생성하지
  않으므로 마이그레이션에서 수동 `ALTER TABLE … ADD COLUMN` + `CREATE INDEX … USING GIST(location)` 추가 (park 마이그레이션 절차와 동일)
- `sigunguCode` 컬럼은 **이번 단계 미포함**. 추후 LIST/DETAIL 노출 단계에서
  `parking-region-backfill.ts` 형태로 별도 추가한다 (traditional-market 패턴 참고)
- `chargeInfo` / `prkplceSe` 인덱스만 두고, 그 외 인덱스(좌표·요금 등)는 노출
  시나리오 확정 후 추가한다 (불필요 인덱스 사전 차단)

---

## 스크립트 구조

```
scripts/ingest/amenities/
├── runner.ts                  # parking 분기 추가
├── types.ts                   # NormalizedParking, 소스키 추가
├── adapter-parking.ts         # 신규 — 전국주차장정보표준데이터
└── … (기존 adapter들)
```

### types.ts 추가

```ts
export interface NormalizedParking {
  sourceId: string;
  name: string;
  prkplceSe: string | null;
  prkplceType: string | null;
  rdnmadr: string | null;
  lnmadr: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  prkcmprt: number | null;
  feedingSe: string | null;
  enforceSe: string | null;
  operDay: string | null;
  weekdayOpenHhmm: string | null;
  weekdayCloseHhmm: string | null;
  satOpenHhmm: string | null;
  satCloseHhmm: string | null;
  holidayOpenHhmm: string | null;
  holidayCloseHhmm: string | null;
  chargeInfo: string | null;
  basicTime: number | null;
  basicCharge: number | null;
  addUnitTime: number | null;
  addUnitCharge: number | null;
  dayCmmtkt: number | null;
  monthCmmtkt: number | null;
  metpay: string | null;
  spcmnt: string | null;
  pwdbsPpkZoneYn: boolean | null;
  institutionNm: string | null;
  phoneNumber: string | null;
  insttCode: string | null;
  insttNm: string | null;
  referenceDate: Date | null;
}
```

`AmenitySourceKey`에 `'parking'` 추가, `AMENITY_INGEST_SOURCE.parking = 'amenity-parking'`.

### adapter-parking.ts 동작

`adapter-park.ts`를 거의 그대로 따라간다.

- `BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api'`
- `PAGE_SIZE = 1000`, `type: 'xml'`
- 페이지네이션은 `fetchAllPages(fetchAmenityPage)` 재사용
- XML 파싱은 `parseXml`/`getItems`/`getTotalCount` 재사용
- 좌표: `Number(latitude)` / `Number(longitude)`가 finite 이고 0이 아니면 사용, 아니면 `null`
- `address = rdnmadr || lnmadr` fallback
- `pwdbsPpkZoneYn`: `'Y' → true`, `'N' → false`, 외 `null`
- `referenceDate`: `YYYY-MM-DD` → `Date | null`
- 숫자 필드(`prkcmprt`, `basicTime`, `basicCharge`, `addUnitTime`,
  `addUnitCharge`, `dayCmmtkt`, `monthCmmtkt`): 빈 문자열은 `null`, 그 외 `Number(x) || null`
- 좌표 없는 행은 `enrichWithGeocode`로 보완 시도 후 반환

### runner.ts 변경

- `parseArgs` 화이트리스트에 `'parking'` 추가
- `ingestParkings()` 분기 추가 (`ev-charger` / `park` / `school` 패턴과 동일)
- 흐름: `fetchAllParkings()` → `dedupeBySourceId(rows)` → `writeParkings(rows)`
- `writeParkings`는 chunk 단위 INSERT … ON CONFLICT DO UPDATE
  - chunk = 500 — 컬럼 ~33개라 PG 바인드 변수 한도(32767) 안에 여유 두기
  - 좌표는 `locationSql(lat, lng)` 헬퍼 재사용
  - `pwdbsPpkZoneYn`, `referenceDate` 등 null 그대로 바인딩

---

## GitHub Action

`/.github/workflows/ingest-amenities.yml`만 수정한다. 신규 yml 없음.

- `workflow_dispatch.inputs.source.description`: 옵션 목록에 `parking` 추가
- matrix `source`: `["ev-charger","traditional-market","store","park","school","childcare","parking"]`
- cron `'0 2 1 * *'` 그대로 (매월 1일 02:00 UTC → KST 11:00)
- secrets 동일 (`PUBLIC_DATA_KEY` 재사용, 신규 secret 없음)
- `timeout-minutes: 180` 그대로. 실측 추정: 18.5k 건 / 1000 = ~19 페이지,
  네트워크 + upsert 합쳐 5분 내 종료 예상

---

## 검증

1. **로컬 dry-run**
   ```
   pnpm tsx scripts/ingest/amenities/runner.ts --source=parking
   ```
   기대치:
   - 로그에 `totalCount ≈ 18527`
   - `IngestionRun.status = 'OK'`, `rowsUpserted ≈ totalCount` (중복 dedupe 후 약간 적을 수 있음)

2. **샘플 SELECT** — 좌표·주소·요금이 빈 값 없이 채워졌는지 확인
   ```sql
   SELECT name, address, chargeInfo, basicCharge, addUnitCharge,
          ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
   FROM "Parking"
   ORDER BY random() LIMIT 5;
   ```

3. **멱등 재실행** — 같은 명령을 한 번 더 돌리고 row count가 변하지 않는지,
   `updatedAt`만 갱신되는지 확인

4. **PostGIS 인덱스 확인** — `\d "Parking"` 으로 `location` GIST 인덱스 존재 확인

---

## 비범위 (이번 PR 제외)

- LIST / DETAIL 페이지 (`/parking/[sigunguCode]`, `/parking/[sigunguCode]/[id]`)
- 단지 상세의 "주변 주차장" 카드 (PostGIS 반경 검색)
- 지도 레이어 노출
- `sigunguCode` 매핑 backfill — 노출 단계에서 별도 PR
- Sitemap / robots / 메뉴 등록

---

## 작업 단위

1. Prisma 모델 `Parking` 추가 + 마이그레이션 생성
2. 마이그레이션에 PostGIS 컬럼 + GIST 인덱스 ALTER 구문 추가
3. `types.ts`에 `NormalizedParking`, `AmenitySourceKey`, `AMENITY_INGEST_SOURCE` 확장
4. `adapter-parking.ts` 작성 (park 어댑터 패턴 준수)
5. `runner.ts`에 `ingestParkings` 분기 + `writeParkings` 추가
6. `ingest-amenities.yml` matrix·dispatch 옵션 확장
7. 로컬 dry-run + 멱등 재실행으로 검증
