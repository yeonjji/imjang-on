# 상세 페이지 공공데이터 보강 — 데이터·필드·섹션 계획

- 작성일: 2026-10-15
- 상태: 초안(사용자 검토 대기)
- 상위 문서: [로드맵](2026-10-15-detail-public-data-roadmap.md)
- 근거: data.go.kr 상세 페이지의 Swagger 명세·컬럼 정의(2026-10-15 확인). **실제 호출 표본은 아직 없다.** "확인 필요"로 표시한 항목은 각 단계 착수 시 표본 호출로 실측한 뒤 확정한다.

이 문서는 단계마다 **어떤 데이터를 가져와서, 어떤 필드로, 어떤 섹션을 만드는지** 정한다. 화면 모양은 이 문서가 아니라 단계별 UI 시안으로 확인받는다.

## 0. 공통 규칙

- **데이터가 없으면 섹션을 숨긴다.** "정보 없음" 같은 빈 문구로 자리를 채우지 않는다. 빈 문구가 페이지마다 반복되면 그 자체가 얇은 콘텐츠가 된다.
- **모든 수치에 출처와 기준 시점을 붙인다.** 새 소스는 `lib/data-sources.ts`에 등록하고, 섹션 하단에 `SourceCaption`을 단다.
- **기존 섹션과 겹치는 값은 다시 보여주지 않는다.** 예를 들어 아파트의 세대당 주차·승강기는 이미 `ComplexInfoSection`(K-apt)에 있다.
- 계산값은 계산식을 짧게 함께 적는다. 예: "월 관리비 ÷ 관리비부과면적".

---

## 1단계 · 공동주택 관리비 → 아파트 상세

### 데이터
| API | 엔드포인트 | 호출 단위 |
|---|---|---|
| 공용관리비 (15057937) | `apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3` 17개 오퍼레이션 | 단지코드 + 연월 |
| 개별사용료 (15059469) | `.../AptIndvdlzManageCostServiceV3` 10개 오퍼레이션 | 단지코드 + 연월 |
| 장기수선충당금 (15059160) | `.../AptRepairsCostServiceV3` 4개 오퍼레이션 | 단지코드 + 연월 |

연결 키는 `AptComplex.kaptCode`다. ㎡당 금액의 분모는 K-apt 기본정보의 관리비부과면적(`kaptMarea`)을 쓴다. 이 값이 이미 저장된 `AptComplex.rawJson`에 들어 있는지는 **확인 필요**하다.

### 쓰는 필드
| 묶음 | 필드 | 용도 |
|---|---|---|
| 인건비 | `pay` `sundryCost` `bonus` `pension` `welfareBenefit` `accidentPremium` `employPremium` `nationalPension` `healthPremium` | 합산해서 "인건비" 한 줄 |
| 공용 용역 | `cleanCost` 청소, `guardCost` 경비, `disinfCost` 소독, `elevCost` 승강기, `hnetwCost` 홈네트워크, `manageCost` 위탁수수료 | 항목별 표시 |
| 수선·시설 | `lrefCost1` 수선, `lrefCost2` 시설유지, `lrefCost3` 안전점검, `lrefCost4` 재해예방 | 합산해서 "수선·시설유지" 한 줄 |
| 기타 공용 | `taxrestCost` `electCost` `telCost` `postageCost`(제세공과), `fuelCost` `refairCost` `carInsurance` `carEtc`(차량), `officeSupply` `bookSupply` `transportCost`(사무), `clothesCost` `eduCost` `hiddenCost` `careItemCost` `accountingCost` | 합산해서 "기타" 한 줄 |
| 개별사용료 | `heatP`+`heatC` 난방, `waterHotP`+`waterHotC` 급탕, `gasP`+`gasC` 가스, `electP`+`electC` 전기, `waterCoolP`+`waterCoolC` 수도, `scrap` `preMeet` `buildInsu` `electionMng` `purifi` | 난방·전기·수도·급탕·가스는 항목별, 나머지는 "기타" |
| 장기수선충당금 | `sLevy` 월부과액, `sTot` 충당금 잔액, `sPer` 적립요율 | 별도 블록 |

`kaptCode`와 `kaptName`은 이미 DB에 있으므로 응답에서 버린다.

### 계산값
- 월 관리비 총액 = 공용 + 개별 + 장기수선 월부과액
- **㎡당 월 관리비** = 총액 ÷ 관리비부과면적
- **같은 시군구 아파트 중앙값 대비 %**: 같은 달, 같은 시군구, 표본 5개 단지 이상일 때만 표시
- **겨울(1월)과 여름(7~8월) 차이**: 난방·급탕 때문에 생기는 계절 편차
- 최근 12개월 추이

### 섹션
- **이름:** 관리비 (id `maintenance-cost`)
- **위치:** `ComplexInfoSection`(단지 정보) 바로 아래
- **구성**
  1. 요약 한 줄: "최근 월 관리비 ㎡당 ○원 · ○○구 아파트 중앙값보다 ○% 높음"
  2. 항목별 내역: 인건비 · 청소 · 경비 · 승강기 · 수선·시설유지 · 난방 · 전기 · 수도 · 기타
  3. 12개월 추이(작은 막대) + 겨울·여름 차이 한 줄
  4. 장기수선충당금: 월부과액, 적립 잔액, 적립요율
  5. 출처: "국토교통부 공동주택관리정보(K-apt), ○년 ○월 부과분"
- **숨김 조건:** 최근 12개월 중 데이터가 있는 달이 없을 때

### 호출량 결정 (착수 전 선택)
단지 약 1.8만 개 × 31 오퍼레이션 = 한 달치에 약 56만 번이다. 개발계정 한도는 API당 하루 5,000번이다.

- **A (권장):** 운영계정 트래픽 증설을 신청하고, 승인 전에는 화면에 쓰는 핵심 오퍼레이션만 호출한다. 다만 핵심만 받으면 총액이 과소 집계되므로, 총액 표시는 승인 후로 미룬다.
- B: K-apt 연간 관리비 파일(3039714)을 사용한다. 컬럼 구성은 **확인 필요**하다.
- C: 처음엔 일부 시군구만 수집하고 점진적으로 넓힌다.

---

## 2단계 · 배정 초등학교(학구도) → 아파트 상세

### 데이터
| 파일 | 필드 | 용도 |
|---|---|---|
| 초등학교통학구역 SHP (15099520) | 학구ID, 학구명, 폴리곤 | 단지 좌표(`Property.location`)가 어느 학구 안인지 PostGIS로 판정 |
| 학교학구도연계정보 (15099521) | `HAKGUDOID` 학구ID, `SCHID` 학교ID, `SCHNM` 학교명, `SCHCLS` 학교급, `EDU_NM` 교육지원청명, `BASEDATE` 기준일 | 학구 → 학교 |

학구도의 `SCHID`는 우리 `School.sourceId`(나이스 `SD_SCHUL_CODE`)와 체계가 다르다. 그래서 **학교명 + 교육지원청명**(`School.eduOffice`)으로 매칭한다. 매칭률은 **확인 필요**하다.

### 섹션
- **이름:** 배정 초등학교 (id `school-zone`)
- **위치:** `NearbySubway` 바로 위
- **구성**
  1. "이 단지는 ○○초등학교 통학구역입니다" + 학교 상세 링크
  2. 공동학구(한 학구에 학교가 둘 이상)면 학교를 모두 나열하고 "공동학구"라고 표시
  3. 단지에서 그 학교까지 직선거리
  4. 주의 문구: "통학구역은 교육청이 매년 조정할 수 있습니다. 입주 전 교육지원청에 확인하세요." + 기준일
- **숨김 조건:** 좌표가 없거나, 어느 학구에도 속하지 않을 때

---

## 3단계 · 건축물대장 → 아파트·오피스텔·빌라 상세

### 데이터
건축HUB 건축물대장정보 서비스(15134735), `apis.data.go.kr/1613000/BldRgstHubService`.

조회 키는 시군구코드 + 법정동코드 + 번 + 지다.
- 시군구·법정동 코드는 `Property.regionCode`(10자리)에서 얻는다.
- 번·지는 그 단지 실거래 원본의 지번(`Transaction.jibun`)에서 얻는다. 주소 문자열을 파싱하는 것보다 안정적이다. 지번이 없거나 서로 엇갈리는 단지 비율은 **확인 필요**하다.

### 쓰는 필드
| 오퍼레이션 | 필드 | 용도 |
|---|---|---|
| 총괄표제부 `getBrRecapTitleInfo` (단지 전체) | `useAprDay` `hhldCnt` `mainBldCnt` `totPkngCnt` `bcRat` `vlRat` `platArea` `totArea` | 사용승인일, 동 수, 총주차, 건폐율·용적률 |
| 표제부 `getBrTitleInfo` (동별) | `dongNm` `mainPurpsCdNm` `etcPurps` `strctCdNm` `grndFlrCnt` `ugrndFlrCnt` `hhldCnt` `hoCnt` `rideUseElvtCnt` `emgenUseElvtCnt` `indrAutoUtcnt` `oudrAutoUtcnt` `indrMechUtcnt` `oudrMechUtcnt` `rserthqkDsgnApplyYn` `rserthqkAblty` `engrGrade` `useAprDay` | 주용도, 구조, 층수, 승강기, 주차 방식, 내진설계 |
| 지역지구구역 `getBrJijiguInfo` | `jijiguCdNm` `reprYn` | 용도지역(대표값) |
| 주택가격 `getBrHsprcInfo` | `hsprc` `stdDay` | 보류. 어떤 주택 유형에 값이 채워지는지 실측 후 결정 |

쓰지 않는 오퍼레이션: 기본개요, 층별개요, 전유부·전유공용면적(호 단위), 오수정화시설, 부속지번.

### 계산값
- **기계식 주차 비율** = 기계식 대수 ÷ 전체 주차 대수
- 세대당 주차대수: 빌라·오피스텔만. 아파트는 이미 K-apt 값이 있다.
- **근린생활시설 포함 여부**(빌라): 표제부 주용도에 '근린생활시설'이 섞여 있는 동

### 섹션
- **이름:** 건축물 정보 (id `building-register`)
- **위치:** `ComplexInfoSection` 아래. 1단계 관리비 섹션이 있으면 그 아래.
- **아파트**에는 K-apt에 없는 것만 보여준다: 용도지역, 건폐율·용적률, 구조, 내진설계 적용 동 수, 기계식 주차 비율, 에너지효율등급.
- **오피스텔·빌라**에서는 이 섹션이 주 건물 정보다: 사용승인일, 주용도, 층수(지상/지하), 세대·호수, 승강기, 주차대수와 방식(자주식/기계식), 세대당 주차, 내진설계, 용도지역, 건폐율·용적률.
- **빌라 주의 표시:** 근린생활시설이 포함된 건물이면 "건축물대장상 일부가 근린생활시설입니다. 주거용 대출·전입 가능 여부를 확인하세요."라고 적는다. 사실만 적고 단정하지 않는다.
- **숨김 조건:** 대장 매칭 실패

---

## 4단계 · 청약 경쟁률·당첨가점 → 청약 상세

### 데이터
- 청약접수 경쟁률 및 특별공급 신청현황(15098905): `api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1`
- 청약 신청·당첨자 정보(15110812): `api.odcloud.kr/api/ApplyhomeStatSvc/v1` (시도·월 단위 통계)

연결 키는 `SubscriptionNotice.houseManageNo`다.

### 쓰는 필드
| 오퍼레이션 | 필드 | 용도 |
|---|---|---|
| `getAPTLttotPblancCmpet` APT 경쟁률 | `HOUSE_TY` `SUPLY_HSHLDCO` `SUBSCRPT_RANK_CODE` `RESIDE_SECD` `RESIDE_SENM` `REQ_CNT` `CMPET_RATE` | 주택형 × 순위 × 거주지역 경쟁률 |
| `getAptLttotPblancScore` 당첨가점 | `HOUSE_TY` `RESIDE_SENM` `LWET_SCORE` `AVRG_SCORE` `TOP_SCORE` | 주택형별 당첨 가점 범위 |
| `getAPTSpsplyReqstStus` 특별공급 | 유형별 배정세대수(다자녀·신혼·생애최초·청년·노부모·신생아·기관추천·이전기관), 유형 × 지역별 접수건수, `SUBSCRPT_RESULT_NM` | 유형별 경쟁률(접수 ÷ 배정) |
| `getUrbtyOfctlLttotPblancCmpet` 오피스텔·도시형 | `HOUSE_TY` `SUPLY_HSHLDCO` `RESIDNT_PRIOR_SENM` `REQ_CNT` `CMPET_RATE` | 비아파트 공고 경쟁률 |
| `getAPTApsPrzwnerStat` 지역 가점 통계 | `STAT_DE` `SUBSCRPT_AREA_CODE_NM` `RESIDE_SECD_NM` `AVRG_SCORE` `MED_SCORE` | 비교 기준값: 같은 달 시도 평균·중위 가점 |

잔여세대·임의공급·취소후재공급·공공지원민간임대 경쟁률은 표본에서 해당 공고 수를 본 뒤 결정한다.

### 섹션
- **이름:** 청약 결과 (id `results`)
- **위치:** `UnitSupplyTable`(공급 세대) 바로 아래
- **구성**
  1. 요약 한 줄: "1순위 해당지역 평균 ○.○대 1 · 최고 ○○형 ○○대 1"
  2. 주택형별 경쟁률 표: 순위, 해당지역/기타지역
  3. 주택형별 당첨 가점: 최저·평균·최고 + "같은 달 ○○ 평균 ○점" 기준값
  4. 특별공급 유형별 경쟁률
  5. 출처: "한국부동산원 청약홈" + 은행 전산 사정으로 접수건수가 바뀔 수 있다는 원문 유의사항
- **숨김 조건:** 접수 전 공고, 또는 결과 데이터가 없는 공고
- 운영계정 심의 승인 전에는 개발계정 한도(하루 4만 번) 안에서 진행한다.

---

## 5. 단계별 착수 전 실측 체크리스트

| 단계 | 실측 항목 |
|---|---|
| 1 | 표본 100개 단지의 오퍼레이션별 채움률, `kaptMarea` 존재 여부, 데이터가 있는 최신 연월, 연간 파일(3039714) 컬럼 |
| 2 | 학구 → 학교 매칭률(학교명 + 교육지원청), 아파트 좌표의 학구 포함률, 공동학구 비율 |
| 3 | `Transaction.jibun` 보유율, 대장 매칭률(아파트·오피스텔·빌라 각각), 근생 포함 빌라 비율, 주택가격 채움 유형 |
| 4 | 최근 1년 공고 중 결과가 있는 비율, 공고 유형별 오퍼레이션 응답 분포 |

실측 결과는 단계별 spec에 적고, 그 뒤 UI 시안을 확인받은 다음 개발한다.
