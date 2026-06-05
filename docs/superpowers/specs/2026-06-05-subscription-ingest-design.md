# 청약·분양 공고 데이터 수집 설계

**날짜**: 2026-06-05
**범위**: 한국부동산원 청약홈 분양정보 + 한국토지주택공사(LH) 사전청약 분양임대공고를 통합 모델로 수집

---

## 목표

부동산 통합 플랫폼에 **청약/분양 공고** 데이터를 추가한다. 출처가 다른 두 공공데이터(청약홈, LH 사전청약)를 **하나의 통합 모델**로 정규화해, 앱에서 단일 목록·필터·지도로 보여줄 수 있게 한다.

- 통합 공고 목록: 지역 / 접수일정 / 공고상태 / 카테고리로 필터
- 주택형별 상세(면적·공급세대·분양가)
- 좌표 기반(청약홈) → 추후 매물·편의시설과 공간 조인

비범위(추후 과제): 앱 UI(목록/상세 페이지), 주소→`Region` FK 매칭, LH 단지 정밀 좌표 보강.

---

## 데이터 출처

| 소스 | API | 키 체계 | 비고 |
|---|---|---|---|
| 청약홈 | `ApplyhomeInfoDetailSvc/v1` (odcloud REST/JSON) | `HOUSE_MANAGE_NO`+`PBLANC_NO` | 5개 카테고리 × {상세, 주택형별} = 10 엔드포인트. 자체 페이지네이션으로 전량 조회 |
| LH 사전청약 | `B552555` (REST/JSON) | `PAN_ID` | 목록(`lhLeaseNoticeBfhInfo1`) → 상세(`lhLeaseNoticeBfhDtlInfo1`) 2단계 |

### 청약홈 5개 카테고리

| key | 카테고리 | 상세 엔드포인트 | 주택형별 엔드포인트 |
|---|---|---|---|
| `apt` | APT(민간사전청약·신혼희망타운 포함) | `getAPTLttotPblancDetail` | `getAPTLttotPblancMdl` |
| `urbty` | 오피스텔/도시형/민간임대/생활숙박 | `getUrbtyOfctlLttotPblancDetail` | `getUrbtyOfctlLttotPblancMdl` |
| `remndr` | APT 잔여세대(무순위·재공급) | `getRemndrLttotPblancDetail` | `getRemndrLttotPblancMdl` |
| `pblpvt` | 공공지원 민간임대 | `getPblPvtRentLttotPblancDetail` | `getPblPvtRentLttotPblancMdl` |
| `opt` | 임의공급 | `getOPTLttotPblancDetail` | `getOPTLttotPblancMdl` |

- 베이스 URL: `https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/{operation}`
- 페이지네이션: `page` / `perPage`, 응답 `{ currentCount, data[], totalCount }`
- 인증: `serviceKey` (= `PUBLIC_DATA_KEY`)

### LH 사전청약 (2단계)

**목록 `lhLeaseNoticeBfhInfo1`** — `B552555/lhLeaseNoticeBfhInfo1/lhLeaseNoticeBfhInfo1`
- 요청(필수): `serviceKey`, `PG_SZ`(페이지크기), `PAGE`(페이지번호), `PAN_ST_DT`/`PAN_ED_DT`(게시일 시작·종료 YYYYMMDD). 옵션: `PAN_NM`, `PAN_SS`.
- 응답 `dsList[]`: `PAN_ID`, `PAN_NM`(공고명), `CNP_CD`/`CNP_CD_NM`(시도코드/지역명), `PAN_NT_ST_DT`(게시일), `CLSG_DT`(마감일), `PAN_SS`(공고상태), `DTL_URL`/`DTL_URL_MOB`, `AIS_TP_CD_NM`(공고세부유형명), `PAN_KD_CD`(01 일반/02 정정), `OTXT_PAN_ID`(원본 공고아이디), `UPD_DTTM`.
- 전량 수집: 서비스 시작일(2023-10-19)~오늘을 한 윈도우로 `PAGE`를 `TOTALCOUNT` 도달까지 페이지네이션.

**상세 `lhLeaseNoticeBfhDtlInfo1`** — `B552555/lhLeaseNoticeBfhDtlInfo1/getLeaseNoticeBfhDtlInfo1`
- 요청(필수): `serviceKey`, `PAN_ID`.
- 응답 서브셋: 접수처정보(`dsCtrtPlc`), 공급일정(`dsSplScdl`), 첨부파일(`dsAhflInfo`), 기타정보(`dsEtcInfo`).

> **LH 좌표 한계**: 목록·상세 모두 단지 지번주소가 없고 지역명이 "전국"인 경우가 많다. → LH는 `location`을 NULL로 두고 지오코딩하지 않는다. 정밀 좌표는 추후 보강.

---

## 데이터 모델 ("컬럼 연관성"의 핵심)

통합 방식: **공통 축은 컬럼으로 정규화, 소스 고유 필드는 `rawJson`에 무손실 보존.** 카테고리별 와이드 테이블(~12개) 대신 테이블 2개로 유지하고, 자주 쓰는 필드는 추후 실제 컬럼으로 승격한다.

```prisma
enum SubscriptionSource {
  APPLYHOME   // 한국부동산원 청약홈
  LH_PRESUB   // LH 사전청약
}

enum SubscriptionCategory {
  APT            // 청약홈 APT(01/09/10)
  OFFICETEL_ETC  // 오피스텔/도시형/민간임대/생활숙박
  REMNANT        // APT 잔여세대(무순위·재공급)
  PUB_PRIV_RENT  // 공공지원 민간임대
  ARBITRARY      // 임의공급
  LH_PRESUB      // LH 사전청약
}

model SubscriptionNotice {
  id           BigInt               @id @default(autoincrement())
  source       SubscriptionSource
  category     SubscriptionCategory
  sourceKey    String               @db.VarChar(120) // 청약홈 "{HOUSE_MANAGE_NO}-{PBLANC_NO}" / LH "{PAN_ID}"

  // 원본 식별자
  houseManageNo String? @db.VarChar(40)
  pblancNo      String? @db.VarChar(40)
  panId         String? @db.VarChar(30)
  origNoticeKey String? @db.VarChar(30) // LH OTXT_PAN_ID(정정공고 → 원본 연결)

  name        String  @db.VarChar(200)
  status      String? @db.VarChar(20)   // LH PAN_SS(공고중/접수중/접수마감) · 청약홈은 추후 날짜 도출
  regionCode  String? @db.VarChar(10)   // 청약홈 SUBSCRPT_AREA_CODE / LH CNP_CD(표준 시도코드)
  regionName  String? @db.VarChar(60)
  address     String? @db.VarChar(256)

  totalSupply Int?

  noticeDate    DateTime? @db.Date  // 모집공고일 / 게시일
  receiptBegin  DateTime? @db.Date
  receiptEnd    DateTime? @db.Date
  winnerDate    DateTime? @db.Date  // 당첨자발표
  contractBegin DateTime? @db.Date
  contractEnd   DateTime? @db.Date
  moveInYm      String?   @db.VarChar(6)

  homepage  String? @db.VarChar(256)
  noticeUrl String? @db.VarChar(300)
  developer String? @db.VarChar(200) // 시행사 BSNS_MBY_NM
  constructor String? @db.VarChar(200) // 시공사 CNSTRCT_ENTRPS_NM
  tel       String? @db.VarChar(30)

  location  Unsupported("geography(Point,4326)")? // 청약홈만 지오코딩
  rawJson   Json    // 소스 원본 응답(상세 포함) 무손실 보존

  updatedAt DateTime @updatedAt
  units     SubscriptionUnit[]

  @@unique([source, sourceKey])
  @@index([category, noticeDate(sort: Desc)])
  @@index([source, status])
  @@index([regionCode])
}

model SubscriptionUnit {
  id            BigInt @id @default(autoincrement())
  noticeId      BigInt
  notice        SubscriptionNotice @relation(fields: [noticeId], references: [id], onDelete: Cascade)

  modelNo       String? @db.VarChar(4)
  houseType     String? @db.VarChar(20) // HOUSE_TY / TP
  area          Decimal? @db.Decimal(10, 4) // 공급면적 SUPLY_AR / 전용면적 EXCLUSE_AR
  generalSupply Int?    // 일반공급세대수
  specialSupply Int?    // 특별공급세대수
  topAmount     Int?    // 분양최고금액(만원) LTTOT_TOP_AMOUNT / SUPLY_AMOUNT
  rawJson       Json    // 카테고리별 특별공급 세분(다자녀/신혼/생애최초… 또는 청년/신혼/고령자)

  @@unique([noticeId, modelNo, houseType])
  @@index([noticeId])
}
```

`location`에 PostGIS GIST 인덱스를 마이그레이션에서 수동 추가한다.

### 통합 매핑표

| 통합 컬럼 | 청약홈 | LH 사전청약 |
|---|---|---|
| source | APPLYHOME | LH_PRESUB |
| sourceKey | `{HOUSE_MANAGE_NO}-{PBLANC_NO}` | `{PAN_ID}` |
| name | HOUSE_NM | PAN_NM(목록) |
| status | (날짜 도출, 추후) | PAN_SS |
| regionCode/Name | SUBSCRPT_AREA_CODE/_NM | CNP_CD/CNP_CD_NM |
| address | HSSPLY_ADRES | (없음, NULL) |
| noticeDate | RCRIT_PBLANC_DE | PAN_NT_ST_DT |
| receiptBegin/End | RCEPT_BGNDE/ENDDE | dsSplScdl ACP_DTTM |
| winnerDate | PRZWNER_PRESNATN_DE | dsSplScdl PZWR_ANC_DT |
| noticeUrl | PBLANC_URL | DTL_URL |
| origNoticeKey | (없음) | OTXT_PAN_ID |
| location | geocode(HSSPLY_ADRES) | NULL |

> **지역코드 주의**: 청약홈 `SUBSCRPT_AREA_CODE`(서울=100…)는 자체 코드라 앱 `Region.code`와 정렬되지 않는다. LH `CNP_CD`(11/26/41…)는 표준 시도코드라 `Region.code` 앞 2자리와 정렬된다. 둘 다 원본 그대로 저장하고 Region FK는 걸지 않는다(추후 과제).

---

## 스크립트 구조

```
scripts/ingest/subscriptions/
├── runner.ts              # 진입점, --source=apt|urbty|remndr|pblpvt|opt|lh|all, IngestionRun, 알림
├── http.ts                # odcloud(page/perPage) + B552555 JSON fetch, 재시도/백오프
├── types.ts               # NormalizedNotice/Unit, enum, 카테고리·엔드포인트 맵
├── upsert.ts              # SubscriptionNotice/Unit ON CONFLICT 청크 upsert + locationSql
├── adapter-apt.ts         # 청약홈 #1 상세 + #4 주택형별
├── adapter-urbty-ofctl.ts # #2 + #5
├── adapter-remndr.ts      # #3 + #6
├── adapter-pbl-pvt-rent.ts# #7 + #8
├── adapter-opt.ts         # #9 + #10
└── adapter-lh-presub.ts   # 목록(lhLeaseNoticeBfhInfo1) → PAN_ID → 상세(lhLeaseNoticeBfhDtlInfo1)
```

### runner.ts 동작 (amenities 패턴 준용)

1. `--source` 로 어댑터 선택 (`all`이면 전체 순회)
2. `IngestionRun` 생성 (RUNNING) — `source`는 `subscription-apt` 등으로 구분
3. 어댑터: 헤더 페이지네이션 → 공고별 주택형별 호출(N+1, rate-limit) → 정규화 → 지오코딩(청약홈) → 청크 `ON CONFLICT` upsert
4. resume: `IngestionRun` 체크포인트(ev-charger 방식)로 마지막 완료 페이지 보관 → 재실행 시 이어받기
5. `IngestionRun` 완료 기록 (OK/ERROR) + Discord 알림

기존 `scripts/ingest/geocoder.ts`(`geocode`, `enrichWithGeocode`)와 `scripts/ingest/amenities/runner.ts`의 `locationSql`/`dedupe`/청크 upsert 패턴을 재사용한다.

---

## GitHub Actions

파일: `.github/workflows/ingest-subscriptions.yml`

- **스케줄**: 일 1회(청약홈 갱신주기=매일, LH=수시). cron 예: `30 18 * * *`
- **수동 실행**: `workflow_dispatch` — source 입력
- **매트릭스**: `[apt, urbty, remndr, pblpvt, opt, lh]` 병렬, `fail-fast: false`
- **환경변수**: `ingest-amenities.yml`과 동일 블록 + `KAKAO_REST_KEY`(지오코딩) 포함, `PUBLIC_DATA_KEY` 재사용

```yaml
name: ingest-subscriptions
on:
  schedule:
    - cron: '30 18 * * *'
  workflow_dispatch:
    inputs:
      source:
        description: 'apt | urbty | remndr | pblpvt | opt | lh | all'
        default: 'all'
jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        source: [apt, urbty, remndr, pblpvt, opt, lh]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/subscriptions/runner.ts --source=${{ matrix.source }}
        timeout-minutes: 120
```

---

## 검증 (TDD)

1. **probe (파서 작성 전)**: 일회용 스크립트로 청약홈 1개 엔드포인트 + LH 목록/상세를 실제 호출, 응답 형태와 `PUBLIC_DATA_KEY`가 두 호스트(odcloud, B552555)에서 동작하는지 확인.
2. **어댑터 단위 테스트** (`tests/ingest/`): 캡처한 fixture JSON → 정규화 rows(`NormalizedNotice`/`Unit`) 단언. 카테고리별 필드 매핑·날짜 파싱·rawJson 보존 검증.
3. **멱등성**: `.env.test` 로컬 docker DB에 소량 수집 → 재실행 시 신규 0건(ON CONFLICT) 확인.

---

## 구현 순서

1. **Prisma 모델 + 마이그레이션** (`SubscriptionNotice`/`Unit`, enum, GIST 인덱스) — `.env.test`로 검증
2. **공통 인프라** (`http.ts`, `types.ts`, `upsert.ts`)
3. **probe** 로 실제 응답 확정
4. **청약홈 `apt` 어댑터** (상세+주택형별+지오코딩) — 패턴 검증용. 단위 테스트 동반
5. **나머지 청약홈 4개 어댑터** (urbty/remndr/pblpvt/opt)
6. **LH 어댑터** (목록→상세)
7. **runner + 체크포인트 resume**
8. **GitHub Actions 워크플로우**
9. 전체 수집 1회 실행 + 멱등성 확인

---

## 향후 확장

- 앱 목록/상세 페이지(별도 spec)
- `status` 자동 도출(청약홈 날짜 기반) + "진행 중 청약" 필터
- 주소/좌표 → `Region` 매칭, LH 단지 정밀 좌표 보강
- 자주 쓰는 rawJson 필드(투기과열지구/조정대상지역/분양가상한제 등) 실제 컬럼 승격
