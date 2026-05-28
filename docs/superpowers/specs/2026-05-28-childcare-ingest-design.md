# 어린이집 데이터 수집 설계

**날짜**: 2026-05-28
**범위**: 한국사회보장정보원 보육정보 공개API(cpmsapi030) 수집 (수집만, 상세 페이지 연동은 향후)

---

## 목표

전국 어린이집 정보를 한국사회보장정보원 `cpmsapi030`(어린이집별 기본정보 조회) XML API에서 수집해 단일 `Childcare` 테이블에 적재한다. 기존 amenity ingest 패턴(학교·공원·상가 등)을 그대로 따른다.

### API 두 개 중 030만 사용하는 이유

| 후보 | 설명 | 채택 |
|---|---|---|
| cpmsapi021 (전국 어린이집 정보조회) | `arcode`별 어린이집 목록. 기본 필드(코드·이름·전화·팩스·주소·홈페이지·정원)만 제공 | ✗ |
| cpmsapi030 (어린이집별 기본정보 조회) | `arcode`별 어린이집 목록 + 좌표(la/lo) + 유형·운영현황·정원/현원·입소대기·CCTV·통학차량·연령별 반/아동/교직원 등 ~70개 필드 | ✓ |

- 030은 021의 모든 실질 필드를 포함하는 **상위호환**이며, 추가로 좌표와 상세 데이터를 제공한다. 021 고유 필드는 `arcode`(우리가 호출 시 쥐고 있는 값)와 `frstcnfmdt`↔030의 `crcnfmdt`(인가일자)뿐으로 데이터 손실이 없다.
- `cpmsapi030`은 `stcode`를 비우고 `arcode`만 넘기면 **해당 시군구 전체 목록**을 한 번에 반환한다(명세 예제로 확인). 따라서 시군구코드(arcode) 순회 ~250회 호출로 전국을 수집할 수 있다 — 어린이집별(stcode) 개별 호출(~4만 건)은 불필요하며 일 요청 한도(INFO-300) 위험만 키운다.
- 030 한 row에 목록용/상세용 필드가 모두 담겨, "두 데이터를 한 페이지에 보여주기"는 머지·조인 없이 자동 해결된다.

### 데이터소스

| 항목 | 값 |
|---|---|
| 서비스 ID | cpmsapi030 |
| URL | `http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request` |
| 요청 파라미터 | `key`(인증키), `arcode`(시군구코드 5자리), `stcode`(미사용 — 비움) |
| 교환 포맷 | XML (`<response><item>...</item>...</response>`) |
| 인증키 | GitHub Secret `CHILDCARE_API_KEY` (코드 하드코딩 금지) |
| 예상 건수 | 전국 ~40,000건 (시군구 ~250개 순회) |
| 갱신 주기 | 월 1회 전체 갱신 |

> ⚠️ 보안: 인증키는 GitHub Secrets에만 저장한다. 명세 공유 과정에서 채팅에 노출된 키는 재발급을 권장한다.

---

## 스키마

운영현황(정상/휴지/재개/폐지)을 포함해 **전부 저장**하고 `status` 컬럼으로 구분한다. 목록·지도 노출 시 쿼리에서 정상·재개만 필터한다.

```prisma
model Childcare {
  id          BigInt                                @id @default(autoincrement())
  sourceId    String                                @unique @db.VarChar(11)  // stcode
  name        String                                @db.VarChar(150)         // crname

  // 분류/상태
  crType      String?                               @db.VarChar(20)          // crtypename: 국공립/사회복지법인/법인·단체등/민간/가정/부모협동/직장
  status      String?                               @db.VarChar(10)          // crstatusname: 정상/휴지/재개/null
  vehicleOp   String?                               @db.VarChar(10)          // crcargbname: 운영/미운영/null
  services    String?                               @db.VarChar(150)         // crspec: 제공서비스(예: 시간연장형,일시보육)

  // 주소/연락/위치
  sido        String?                               @db.VarChar(20)          // sidoname
  sigungu     String?                               @db.VarChar(20)          // sigunguname
  sigunguCode String                                @db.VarChar(5)           // arcode (호출 파라미터)
  zipcode     String?                               @db.VarChar(6)           // zipcode
  address     String                                @db.VarChar(300)         // craddr
  tel         String?                               @db.VarChar(14)          // crtelno
  fax         String?                               @db.VarChar(14)          // crfaxno
  homepage    String?                               @db.VarChar(150)         // crhome
  repName     String?                               @db.VarChar(60)          // crrepname
  location    Unsupported("geography(Point,4326)")?                          // la/lo

  // 시설/정원
  roomCount       Int?                                                       // nrtrroomcnt 보육실수
  roomSize        Float?                                                     // nrtrroomsize 보육실 면적
  playgroundCount Int?                                                       // plgrdco 놀이터수
  cctvCount       Int?                                                       // cctvinstlcnt CCTV총설치수
  staffCount      Int?                                                       // chcrtescnt 보육교직원수
  capacity        Int?                                                       // crcapat 정원
  currentCount    Int?                                                       // crchcnt 현원

  // 일자
  confirmDate    DateTime? @db.Date                                          // crcnfmdt 인가일자
  pauseBeginDate DateTime? @db.Date                                          // crpausebegindt 휴지시작
  pauseEndDate   DateTime? @db.Date                                          // crpauseenddt 휴지종료
  abolishDate    DateTime? @db.Date                                          // crabldt 폐지일자
  dataStdDate    DateTime? @db.Date                                          // datastdrdt 데이터기준일자

  // 반수(class_cnt_*)
  classCnt00  Int?  // 만0세
  classCnt01  Int?  // 만1세
  classCnt02  Int?  // 만2세
  classCnt03  Int?  // 만3세
  classCnt04  Int?  // 만4세
  classCnt05  Int?  // 만5세
  classCntM2  Int?  // 영아혼합(0~2세)
  classCntM3  Int?  // 영유아혼합(2~3세)
  classCntM5  Int?  // 유아혼합(3~5세)
  classCntSp  Int?  // 특수장애
  classCntTot Int?  // 총계

  // 아동수(child_cnt_*)
  childCnt00  Int?
  childCnt01  Int?
  childCnt02  Int?
  childCnt03  Int?
  childCnt04  Int?
  childCnt05  Int?
  childCntM2  Int?
  childCntM3  Int?
  childCntM5  Int?
  childCntSp  Int?
  childCntTot Int?

  // 교직원 근속년수(em_cnt_*y)
  emTenure0y Int?  // 1년미만
  emTenure1y Int?  // 1~2년
  emTenure2y Int?  // 2~4년
  emTenure4y Int?  // 4~6년
  emTenure6y Int?  // 6년이상

  // 교직원 직역(em_cnt_a*)
  emRoleDirector    Int?  // a1 원장
  emRoleTeacher     Int?  // a2 보육교사
  emRoleSpecial     Int?  // a3 특수교사
  emRoleTherapy     Int?  // a4 치료교사
  emRoleNutrition   Int?  // a5 영양사
  emRoleNurse       Int?  // a6 간호사
  emRoleNurseAssist Int?  // a10 간호조무사
  emRoleCook        Int?  // a7 조리원
  emRoleOffice      Int?  // a8 사무직원
  emRoleTot         Int?  // 총계

  // 입소대기 아동수(ew_cnt_*)
  waitCnt00  Int?
  waitCnt01  Int?
  waitCnt02  Int?
  waitCnt03  Int?
  waitCnt04  Int?
  waitCnt05  Int?
  waitCntM6  Int?  // 6세이상
  waitCntTot Int?  // 총계

  updatedAt DateTime @updatedAt

  @@index([sigunguCode, status])
  @@index([crType])
}
```

`location` 컬럼에 PostGIS GIST 인덱스를 마이그레이션에서 수동 추가한다(기존 amenity 관례와 동일).

### 필드 매핑 메모

- **날짜**: 030 예제는 `2007-01-10` 형식(대시 포함). 빈 문자열은 `null`로 매핑. `crpausebegindt`/`crpauseenddt`/`crabldt`는 운영중일 때 비어 있음.
- **숫자**: `number(9)` 류는 `Int?`. `nrtrroomsize`(number(18,2))는 `Float?`.
- **충원율**: `currentCount / capacity`로 화면에서 계산(저장 안 함).

---

## 스크립트 구조

```
scripts/ingest/amenities/
├── runner.ts                 # childcare 분기 추가, parseArgs 소스 목록 확장
├── types.ts                  # NormalizedChildcare 추가, AmenitySourceKey/AMENITY_INGEST_SOURCE 확장
├── adapter-childcare.ts      # 신규 — cpmsapi030 수집
├── adapter-school.ts
├── adapter-park.ts
└── ...
```

### adapter-childcare.ts 동작

1. **arcode 목록 확보**: `Region` 테이블에서 `distinct sigunguCode`(null 제외)를 조회 (~250개).
2. **arcode별 1회 호출**: `GET .../cpmsapi030/...?key={CHILDCARE_API_KEY}&arcode={code}&stcode=`
3. **파싱**: `xml-parse.ts`의 `parseXml`로 파싱 후 `response.item`(단건이면 객체, 복수면 배열) 정규화. `<item>` → `NormalizedChildcare`.
4. **정보/에러 코드 처리**:
   - `INFO-200`(검색결과 없음) → 해당 arcode skip
   - `INFO-300`(일 요청 한도 초과) → 명확한 메시지와 함께 중단(부분 적재 후 재실행)
   - `INFO-100`/`INFO-400`(인증키) · `ERROR-100`/`ERROR-200` → throw
5. **좌표 처리**: la/lo 파싱 → Korea bbox 검증(위도 33~39, 경도 124~132). 유효하면 그대로, 비거나 범위 밖이면 `geocode-fill.ts`의 `enrichWithGeocode`로 주소 기반 지오코딩 폴백.
6. **호출 간 짧은 지연**(예: 100~200ms)으로 한도 보호.
7. 반환: `NormalizedChildcare[]`.

> 페이지네이션 없음 — arcode당 단일 호출이 전체 목록 반환. (`fetchAllPages` 미사용)

### types.ts 추가

```ts
export interface NormalizedChildcare {
  sourceId: string;          // stcode
  name: string;
  crType: string | null;
  status: string | null;
  vehicleOp: string | null;
  services: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string;       // arcode
  zipcode: string | null;
  address: string;
  tel: string | null;
  fax: string | null;
  homepage: string | null;
  repName: string | null;
  lat: number | null;
  lng: number | null;
  roomCount: number | null;
  roomSize: number | null;
  playgroundCount: number | null;
  cctvCount: number | null;
  staffCount: number | null;
  capacity: number | null;
  currentCount: number | null;
  confirmDate: string | null;     // YYYY-MM-DD | null
  pauseBeginDate: string | null;
  pauseEndDate: string | null;
  abolishDate: string | null;
  dataStdDate: string | null;
  // 반수/아동수/교직원/입소대기 카운트 (위 스키마와 1:1)
  classCnt00: number | null; /* …Tot까지 */
  childCnt00: number | null; /* …Tot까지 */
  emTenure0y: number | null; /* …6y까지 */
  emRoleDirector: number | null; /* …Tot까지 */
  waitCnt00: number | null; /* …Tot까지 */
}

export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'park'
  | 'school'
  | 'childcare';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  // 기존 항목 …
  'childcare': 'amenity-childcare',
};
```

### runner.ts 변경

- `parseArgs`의 허용 소스 목록과 에러 메시지에 `childcare` 추가.
- 분기 추가:

```ts
} else if (source === 'childcare') {
  upserted = await ingestChildcare();
}
```

- `ingestChildcare()`는 기존 `ingestStores()`와 동일한 구조: `dedupeBySourceId` 후 `CHUNK`(1000) 단위 raw `INSERT … ON CONFLICT ("sourceId") DO UPDATE`, `locationSql(lat, lng)`로 location 갱신. 날짜 컬럼은 `null` 또는 `Date`로 바인딩.

---

## 좌표 처리

- 030은 `la`(위도)/`lo`(경도)를 직접 제공하나, 명세 예제값이 깨져 있어(서울이 위도 47°) 신뢰 검증이 필요하다.
- 규칙: `lat ∈ [33, 39]`, `lng ∈ [124, 132]`이고 `0`이 아니면 사용. 아니면 `null` 처리 후 `enrichWithGeocode`(Kakao, `KAKAO_REST_KEY`)로 주소 지오코딩 폴백.
- 지오코딩 실패 시 `location`은 `NULL::geography`로 적재(기존 amenity와 동일하게 허용).

---

## GitHub Actions

파일: `.github/workflows/ingest-amenities.yml`

- matrix 소스 목록에 `childcare` 추가:

```yaml
matrix:
  source: ${{ github.event_name == 'workflow_dispatch'
    && fromJson(format('["{0}"]', inputs.source))
    || fromJson('["ev-charger","traditional-market","store","school","park","childcare"]') }}
```

- `workflow_dispatch` input description에 `childcare` 추가.
- env 블록에 `CHILDCARE_API_KEY: ${{ secrets.CHILDCARE_API_KEY }}` 추가.
- 스케줄: 기존과 동일(매월 1일 02:00 UTC). `fail-fast: false`, `timeout-minutes: 180` 유지 — ~250 호출이라 수 분 내 완료.

### 환경변수

- `lib/env`에 `CHILDCARE_API_KEY` 추가(서버 전용).
- `.env.example`에 `CHILDCARE_API_KEY=` 항목 추가.

---

## 테스트

vitest 단위 테스트(`tests/ingest/`):

- `parseChildcareXml`: 단건/복수 `<item>` 파싱, 빈 `<crhome />`·빈 날짜 → null, 카운트 필드 숫자 변환.
- 좌표 검증: 정상 좌표 통과, 범위 밖/0 → null.
- 상태 보존: 폐지·휴지 item도 row로 생성되고 `status`가 보존되는지.
- 정보 코드: `INFO-200` → 빈 배열, `INFO-100`/`ERROR-*` → throw.

fixture: 명세 예제 XML(정상 1건 + 폐지 1건)을 기반으로 작성.

---

## 향후 확장 (이번 범위 밖)

- 상세 페이지: `Childcare` 1 row로 목록 헤더 + 상세(충원율, 입소대기, CCTV, 통학차량, 연령별 현황) 렌더.
- 매물 상세 연동: PostGIS `ST_DWithin`으로 반경 조회(예: 1km), 운영중(정상·재개)만 노출.
