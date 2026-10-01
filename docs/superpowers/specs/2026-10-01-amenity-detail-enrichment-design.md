# 생활시설 상세 페이지 보강 설계

- 작성일: 2026-10-01
- 상태: 승인. PR 1(전통시장) #319 머지·운영 수집 완료(2026-10-01)
- **범위 변경(2026-10-01):** 편의점·마트·카페·전통시장 상세는 향후 삭제를 검토하므로 보강 대상에서 제외한다. PR 4는 취소하고, 6·7절의 Store 관련 항목(정보 행, 같은 건물 시설)도 하지 않는다. 삭제 작업 자체는 별도로 설계한다.
- 시안: https://claude.ai/artifact/UYCm5DasufSoGnMZjo62Qg (사용자가 섹션을 직접 삭제해 확정한 버전)

## 1. 목적과 배경

AdSense 승인을 위해 생활시설 상세 페이지(전통시장·편의점·카페·마트·공원·학교·EV 충전소·약국·주차장·병원)에 **그 시설에만 해당하는 정보**를 더한다.

- 거절 라벨은 Low value(질)이고, 3차 재진단에서 원인은 주변 데이터를 이어 붙인 replicated content로 정리됐다. 따라서 보강의 1순위는 **원천 API에서 아직 저장하지 않은 필드**다.
- 계산값(기존 데이터 조합)은 실제 쓰임새가 뚜렷한 것만 둔다. "가까운 ○○ 목록"과 "동네 비교" 성격의 섹션은 시안 검토에서 사용자가 삭제했다.
- 생활편의 상세는 공개를 유지한다(공개 중단안 D1은 이번에 채택하지 않음).

### 범위 밖
- 수집 주기 변경, Store prune(5차 감사 할 일 9a), 생활편의 상세의 noindex 정책 변경
- 어린이집 비교 카드: 기존 인사이트(`lib/insights/childcare.ts`의 occupancy·wait·ratio)와 중복이라 제외
- 약국 "가까운 병·의원" 섹션: 병원 쪽 "처방 후 들를 약국"만 둔다(한 방향)

## 2. 실측 근거 (2026-09-30)

| 소스 | 표본 | 주요 채움률 |
|---|---|---|
| 전국전통시장표준데이터 | 1,393곳 전수 | 점포 수·개설 주기·취급 품목·주차장·화장실 100%, 개설 연도 99%, 전화 61%, 홈페이지 5%, 온누리상품권 0% |
| 전국도시공원정보표준데이터 | 1,000건 | 시설 4종 28%(교양 4%), 지정 고시일 78%, 관리기관·전화 98% |
| 나이스 schoolInfo | 표본 | 고교 유형·계열·전형·설립일·개교기념일 제공 |
| 소상공인 상가(상권)정보 | 편의점·카페 각 1,000건 | 층 52~59%, 건물명 31~32%, 행정동·건물관리번호 100% |
| HIRA 약국 xlsx | 25,760곳 | 15개 컬럼 전부 이미 저장. 영업시간 없음 |
| EV 충전소 | 미실측 | 9/30 일일 호출 한도 초과로 호출 실패 |

추가 발견: 대형마트 업종코드 `G20402` 호출이 `NODATA_ERROR`. 별도 확인이 필요하다.

## 3. 구현 단위 (카테고리별 세로 조각)

PR 하나에 마이그레이션, 수집, 화면을 함께 담는다. 순서:

| PR | 범위 | 비고 |
|---|---|---|
| 1 | 전통시장 | 파일럿. 패턴 확정 |
| 2 | 공원 | 축구장 환산(순수 계산) 포함 |
| 3 | 학교 기본 필드 | 학급 편성 제외 |
| ~~4~~ | ~~편의점·카페·마트 + 같은 건물 시설~~ | **취소**(2026-10-01 범위 변경) |
| 5 | EV 충전소 | 채움률 실측과 한도 초과 원인 확인이 먼저 |
| 6 | 계산값 묶음 | 공원 규모, 약국 "동네 속", 주차장 요금 비교, 병원 약국·진료과 |
| 7 | 후속 | 약국 영업시간(HIRA 세부정보 602곳 또는 국립중앙의료원 API 활용신청), 학교 학급 편성(나이스 classInfo). 이 문서에서는 세부 설계를 하지 않는다 |

## 4. 데이터 모델

원칙:
- 새 컬럼은 전부 nullable이다. 백필 마이그레이션은 쓰지 않고, 다음 수집의 `ON CONFLICT DO UPDATE`로 채운다.
- 원본 문자열을 그대로 저장하고, 분리·계산은 표시 시점에 한다(기존 `branchName` 원칙과 동일).

| PR | 테이블 | 추가 컬럼 ← 원천 필드 |
|---|---|---|
| 1 | `TraditionalMarket` | `storeCount Int` ← storNumber · `openCycle VarChar(40)` ← mrktEstblCycle · `establishedYear Int` ← estblYear · `products VarChar(300)` ← trtmntPrdlst · `hasParking Boolean` ← prkplceYn · `hasToilet Boolean` ← pblicToiletYn · `tel VarChar(30)` ← phoneNumber · `homepage VarChar(200)` ← homepageUrl · `referenceDate Date` ← referenceDate |
| 2 | `Park` | `facilitySport`·`facilityPlay`·`facilityConvenience`·`facilityCulture VarChar(300)` ← mvmFclty·amsmtFclty·cnvnncFclty·cltrFclty (etcFclty는 표시하지 않으므로 저장하지 않음) · `designatedAt Date` ← appnNtfcDate · `managingOrg VarChar(100)` ← institutionNm · `tel VarChar(30)` ← phoneNumber |
| 3 | `School` | `hsType VarChar(20)` ← HS_SC_NM · `hsTrack VarChar(20)` ← HS_GNRL_BUSNS_SC_NM · `specialPurpose VarChar(40)` ← SPCLY_PURPS_HS_ORD_NM · `admissionPeriod VarChar(10)` ← ENE_BFE_SEHF_SC_NM · `foundedAt Date` ← FOND_YMD · `anniversaryAt Date` ← FOAS_MEMRD |
| 4 | `Store` | `adongName VarChar(40)` ← adongNm · `floor VarChar(10)` ← flrNo · `buildingName VarChar(100)` ← bldNm · `buildingMgmtNo VarChar(25)` ← bldMngNo, **인덱스 추가** |
| 5 | `EvCharger`/`EvChargerUnit` | 실측 후 확정. 후보: 충전소 단위 useTime·parkingFree·limitDetail·floor·installYear, 충전기 단위 outputKw |

법정동(ldongNm)은 행정동과 겹쳐 보여 저장하지 않는다.

## 5. 수집

변경 위치(PR마다 동일): `scripts/ingest/amenities/types.ts`의 `Normalized*` 타입, `adapter-*.ts` 파서, `runner.ts`의 INSERT·`DO UPDATE SET` 컬럼 목록.

파싱 규칙:
- Y/N: `'Y'`는 true, `'N'`은 false, 그 외 null. 주차장 어댑터의 `boolFromYn`을 공용 헬퍼로 올린다.
- 정수: 정수가 아니면 null. 개설 연도는 1700~올해 범위 밖이면 null.
- 표준데이터 날짜 `YYYY-MM-DD`: 공원·주차장 어댑터의 `parseRefDate`를 공용 헬퍼로 올린다.
- 나이스 날짜: `YYYYMMDD` 8자리만 인정한다.
- 문자열: 빈 값은 null, `decodeEntities` 적용.
- 전통시장 `sourceId`(이름+주소 해시)는 바꾸지 않는다.
- 홈페이지는 원본 그대로 저장하고, 링크는 표시 시점에 `externalHref()`로 정규화한다.

Store: 9/1 수집에 없던 옛 행 약 3.3만 개는 새 컬럼이 null로 남고, 새 섹션이 자동으로 숨겨진다.

## 6. 화면

### 전통시장·편의점 (`/amenity/[category]/[id]`)
- 공용 타입 `AmenityItem`에 선택 필드를 추가하고 `getById`의 `select`를 넓힌다.
- `detailFields`는 값이 null인 행을 반환하지 않는다(현재는 `'-'`로 채움).
- 전통시장 전용 카드:
  - `MarketOverview`: 점포 수, 개설 햇수, 장날, 주차장·화장실
  - `MarketProducts`: 취급 품목 칩
- 전통시장 히어로 요약 한 줄: "1955년 개설 · 점포 64곳 · 4·9일 장날"
- 장날은 **"매월 4·9·14·19·24·29일" 같은 날짜 목록**으로 표시한다. "다음 장날"은 ISR 캐시(24시간) 때문에 지난 날짜가 보일 수 있어 쓰지 않는다. 매일장은 "매일 개장", 파싱이 안 되는 형식은 원문을 보여준다.
- 시안의 "전국 중앙값" 보조 문구는 넣지 않는다.
- 편의점·카페·마트: 정보 행에 행정동, 층, 건물명(값 있을 때만)을 추가하고, `SameBuildingFacilities` 카드를 넣는다(PR 4).

### 공원 (`/urban/park/[id]`)
- 어댑터가 `findUnique`로 행 전체를 읽으므로 조회 코드는 바꾸지 않는다.
- `detailFields`에 지정 고시일, 관리기관, 전화를 추가한다.
- `ParkFacilities` 카드: 시설 4묶음을 칩으로 표시하고, 값이 있는 묶음만 보인다. 전부 비면 카드를 숨긴다.
- 히어로: "면적 · 축구장 약 N개 · YYYY년 지정" (축구장 1면 = 7,140㎡)

### 학교 (`/school/[sigunguCode]/[id]`)
- `SchoolInfo`에 고교 유형·계열, 입학 전형, 설립일, 개교기념일을 추가한다. 고교 전용 필드는 고등학교에서만 보인다.
- 히어로에 고교 유형 배지와 "개교 N년"을 넣는다.

### 표시 헬퍼 (순수 함수)
- `lib/amenity/market-display.ts`: 개설 주기 파싱, 품목 분리, 개설 햇수
- `lib/urban/park-display.ts`: 시설 문자열 분리, 축구장 환산

### 공통
- 출처 캡션은 기존 레지스트리 id(`mois-market`, `mois-park`, `neis`, `semas-store`)를 쓴다. 전통시장은 기준일도 표시한다.
- 타일은 모바일에서 2열로 접히고, 한글 본문은 14px 이상(DESIGN.md).

## 7. 계산 쿼리 (PR 4, 6)

원칙:
- 반경·최근접은 기존 GiST 인덱스를 쓴다(`ST_DWithin`, `ORDER BY location <-> 점 LIMIT n`).
- 한 렌더 안의 중복 호출은 React `cache()`로 막는다.
- **페이지당 추가 쿼리는 3개 이하**로 제한한다(9/30 CPU 포화 기록).
- 계산 함수는 `lib/<domain>/…-context.ts`에 두고, 섹션 하나의 데이터를 돌려준다. 값이 부족하면 null을 돌려주고 카드를 숨긴다(예: 비교 대상 3곳 미만이면 순위·평균 생략).

| PR | 섹션 | 쿼리 |
|---|---|---|
| 4 | 편의점 · 같은 건물의 생활시설 | `Store WHERE buildingMgmtNo = $1 AND id <> $2 LIMIT 5`. 상세 페이지가 있는 업종만 링크(`storeHref`), 나머지는 텍스트 |
| 6 | 공원 · 규모 | 같은 시군구·같은 유형 중 면적 순위와 전체 수(1쿼리) · 반경 1km 공원 수와 그중 어린이공원 수(`FILTER`) |
| 6 | 약국 · 동네 속 이 약국 | 같은 읍면동 약국 수와 개설 순서 · 최근접 약국 1곳(KNN) · 도보권 500m 일요일 진료 의원 수(`HospitalDetail.openSun IS NOT NULL`). 영업 연차는 순수 계산 |
| 6 | 주차장 · 요금 비교 | 시군구 공영주차장의 30분 환산 기본요금 평균, 월정기권 평균(0·null 제외) · 반경 500m 공영 수와 면수 |
| 6 | 병원 · 처방 후 들를 약국 | 최근접 약국 3곳(KNN, 300m 이내), 약국 상세로 링크 |
| 6 | 병원 · 같은 진료과 | 반경 1km 같은 진료과 의원 수, 그중 토요일 진료(`openSat`), 평일 종료 20:00 이후 야간 진료 수 |

## 8. 테스트

| 층 | 내용 |
|---|---|
| 단위 | 파서 새 필드(9/30 실측 응답 픽스처: 장호원전통시장, 가락고, GS25 종로방통대점), 표시 헬퍼, 30분 요금 환산. 기존 `tests/ingest/amenities/adapter-{store,traditional-market,park}.test.ts`에 추가하고 `adapter-school.test.ts`는 새로 만든다 |
| 통합 | PR 4·6 계산 쿼리. 테스트가 자체 데이터를 시드한다. CI `test:integration`은 continue-on-error라 로컬 결과를 PR에 첨부 |
| e2e | 새 섹션 노출과 null 시 숨김. `seed-e2e.ts`에 값이 있는 행과 빈 행을 모두 추가 |
| 게이트 | `pnpm lint`, `pnpm typecheck`, `pnpm build`를 로컬에서 실행(CI에 build 없음) |

## 9. 배포

1. `feat/*` 브랜치에서 main으로 PR, 머지 즉시 배포.
2. 마이그레이션은 `deploy/remote-deploy.sh`가 web 빌드 전에 `prisma migrate deploy`로 자동 적용한다.
3. 새 마이그레이션 폴더만 좁게 `git add`한다.
4. 배포 후 PR 1~3은 박스에서 해당 source(`traditional-market`, `park`, `school`)를 1회 수동 수집하고 `IngestionRun` OK와 non-null 비율을 확인한다. PR 4는 11/1 정기 수집(매월 1일 02:00 UTC)으로 채운다.
5. 머지 전 실데이터 QA는 운영 DB 읽기 전용 터널로 표본 렌더를 확인한다(`.env.*.local`).

## 10. 성공 기준

- 새 섹션은 값이 있는 페이지에서만 보이고, null 때문에 "-" 행이나 빈 카드가 생기지 않는다.
- 수집 후 각 새 컬럼의 채움률이 2절 실측치 ±10%p 안에 든다.
- 페이지당 추가 쿼리 3개 이하, 콜드 렌더 시간이 눈에 띄게 늘지 않는다.

## 11. 미해결 사항

- EV API 일일 한도 초과 원인과 로컬·운영 키 공유 여부(PR 5 전 확인)
- 대형마트 업종코드 `G20402` NODATA(수집 공백 여부 확인)
- PR 7 후속: 국립중앙의료원 약국 API 활용신청(사용자 작업), 나이스 classInfo 호출량
