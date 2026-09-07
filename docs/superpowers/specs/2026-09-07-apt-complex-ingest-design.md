# 공동주택 단지정보 수집·매칭 (AptComplex ETL)

**작성일** 2026-09-07
**대상** 아파트 `Property` 44,479개 / 국토교통부 공동주택 단지 22,298개
**목표** 단지정보를 우리 DB에 적재하고 `Property`에 안전하게 연결한다. **이번 스펙은 화면에 아무것도 노출하지 않는다.**

---

## 0. 범위

이 스펙은 데이터 계층만 다룬다. 해석 문장(narrative)과 UI는 **후속 스펙**이다.

| 단계 | 이번 스펙 | 후속 스펙 |
|---|---|---|
| 1. `AptComplex` 스키마 | ✅ | |
| 2. 목록 ETL | ✅ | |
| 3. 상세 ETL | ✅ | |
| 4. 매칭 audit | ✅ | |
| 5. 매칭 실행 | ✅ | |
| 6. `households`/`buildingCount` 역채움 | ✅ | |
| 7. 기존 narrative 변화량 측정 | ✅ | |
| 8. 단지정보 해석 모듈 | | ✅ |
| 9. UI 섹션 | | ✅ |

**색인·캐시 영향이 0인 상태로 데이터만 쌓는 것**이 이 스펙의 안전 조건이다. `revalidatePaths`를 호출하지 않는다 — 재검증할 페이지가 없다.

---

## 1. 실측 (2026-09-07, 운영 DB 읽기전용 + API 실호출)

### 1.1 모수 — 진짜 병목은 필드 결측이 아니라 대상 범위

| 항목 | 값 |
|---|---|
| API 단지 목록 `getTotalAptList4` totalCount | **22,298** |
| 우리 `Property` 아파트 (`redirectToId IS NULL`) | **44,479** |
| 이론상 최대 커버리지 | **≈ 50%** |
| 최근 1년 거래 있는 아파트 | 40,036 |

이 API는 **의무관리대상 공동주택**(대략 150세대 이상)만 담는다. 나홀로 아파트·소규모 단지는 아예 없다. 송파구 대조: API 177 vs 우리 454.

빠지는 절반은 소규모 단지라 거래량·트래픽도 적은 쪽이다. 페이지 수로는 절반이지만 실사용 가치 비중은 그보다 높다.

> ⚠️ **정정.** 2026-09-03 세션 기록의 "단지 96.9%는 세대수까지만, 25.5%만 주차·난방까지"는 재검증 결과 **틀린 전제**였다. 매칭된 단지 안에서는 대부분 필드가 70~100% 채워진다. 제약은 모수다.

### 1.2 필드 채움률 (전국 무작위 36개 단지 실호출)

| 필드 | 채움률 | 필드 | 채움률 |
|---|---|---|---|
| `kaptDongCnt` 동수 | 100% | `kaptdWtimebus` 버스 도보 | 92% |
| `kaptUsedate` 사용승인일 | 100% | `kaptdWtimesub` 지하철 도보 | 89% |
| `kaptTopFloor` 최고층 | 100% | `kaptdCccnt` CCTV | 89% |
| `codeHeatNm` 난방 | 100% | `subwayLine` 노선 | 86% |
| `codeHallNm` 복도유형 | 97% | `welfareFacility` 부대복리 | 86% |
| `kaptBcompany` 시공사 | 97% | `kaptdPcnt` 지상주차 | 78% |
| `kaptdaCnt` 세대수 | 86% | `kaptdEcntp` EV | 72% |
| `kaptBaseFloor` 지하층 | 78% | `kaptdPcntu` 지하주차 | 69% |
| **`kaptMparea60/85` 면적별** | **61%** | `subwayStation` 역명 | 50% |
| `kaptMparea135` | 33% | `kaptMparea136` | 14% |

면적별 세대수는 전체 아파트로 환산하면 대략 30%다. 화면 설계에서 가장 중요한 재료인데 가장 얇다.

**미측정 필드.** `kaptdEcnt`(승강기)와 `groundElChargerCnt`/`undergroundElChargerCnt`(EV 지상·지하 분리)는 채움률을 재지 못했다. 표의 EV 72%는 `kaptdEcntp` 기준이고 스키마가 쓰는 분리 필드와 다르다. 상세 수집 후 실측해 화면 스펙의 노출 기준에 반영한다.

검산: 헬리오시티 2,854 + 5,132 + 1,500 + 24 = 9,510 = `kaptdaCnt` 일치.

### 1.3 우리 쪽 결손

| 필드 | 아파트 44,479개 중 |
|---|---|
| `builtYear` | **44,479 (100%)** |
| `households` | **0** |
| `buildingCount` | **0** |

`lib/insights/apt.ts`의 `bScale`과 `lib/seo/blurb.ts`가 이미 `households`를 참조하는데 전량 NULL이다. 이 ETL은 새 기능이기 이전에 **기존 결손의 보충**이다.

### 1.4 행정구역 코드 — 매핑 불필요

우리 DB에는 `29`(광주)·`46`(전남) 코드가 없고 신코드 `12`가 2,621개 있다. API도 같다.

```
12110 → 152건  "전남광주통합특별시 목포시"  bjdCode=1211010100
12710 → 8건    "전남광주통합특별시 담양군"
29155 → 0건    (구 광주 광산구)
46110 → 0건    (구 전남 목포)
28185 → 177건  "인천광역시 연수구"
```

**API도 2026-07 개편 신코드 체계다.** `LEFT(bjdCode,5)`가 우리 `sigunguCode`와 그대로 맞는다. 별도 코드 매핑 단계가 필요 없다.

### 1.5 API 안정성

시군구 30개 조회 중 **13개가 타임아웃**(43%). 연속 호출 탓일 수 있으나 이 API가 부하에 약한 것은 확인됐다. 지수 백오프 재시도가 필수다.

---

## 2. 엔드포인트

경로는 추측으로 찾을 수 없다(모든 변형이 `NO_OPENAPI_SERVICE_ERROR`). 아래가 실호출로 확인된 값이다.

```
https://apis.data.go.kr/1613000/AptListService4/getTotalAptList4      # 전체 목록
https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4    # 시군구별
https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5   # 기본정보
https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5    # 상세정보
```

인증은 기존 `PUBLIC_DATA_KEY`. 두 서비스 모두 활용신청 승인 완료(2026-09-07 실호출 확인).

트래픽 한도는 운영계정 전환으로 마이페이지에 **일일 100,000**으로 표기돼 있다. 다만 **실제 반영 여부는 API로 확인할 수 없다** — data.go.kr은 잔여·설정 한도를 응답에 담지 않고, 한도 초과 시에만 오류를 준다. 첫 상세 수집 런이 곧 검증이다(§4.2).

목록 API 응답 항목: `kaptCode`·`kaptName`·`bjdCode`·`as1`~`as4`. **매칭에 필요한 값이 목록만으로 전부 확보된다**(상세는 매칭 판정에 쓰이지 않는다).

---

## 3. 데이터 모델

```prisma
/// 공동주택 단지정보(국토교통부 AptBasisInfoServiceV5). 의무관리대상 공동주택만 대상이라
/// 우리 Property 아파트의 약 절반만 대응된다. 미매칭 행도 그대로 보관한다 —
/// 매칭 규칙을 개선하면 API 재호출 없이 커버리지가 올라간다.
model AptComplex {
  kaptCode    String  @id @db.VarChar(20)
  kaptName    String  @db.VarChar(120)
  nameNorm    String  @db.VarChar(120)   // 정규화 파이프라인 결과 — 매칭용
  bjdCode     String  @db.VarChar(10)
  sigunguCode String  @db.VarChar(5)     // LEFT(bjdCode,5)
  as3         String? @db.VarChar(40)    // 읍면동명 — 동명 게이트용

  // 1군 · 가격 해석에 직접 쓰이는 값
  households    Int?      // kaptdaCnt
  buildingCount Int?      // kaptDongCnt
  usedate       DateTime? @db.Date        // kaptUsedate (YYYYMMDD)
  hallType      String?   @db.VarChar(20) // codeHallNm
  heatType      String?   @db.VarChar(20) // codeHeatNm
  aptKind       String?   @db.VarChar(20) // codeAptNm
  topFloor      Int?      // kaptTopFloor
  baseFloor     Int?      // kaptBaseFloor
  area60        Int?      // kaptMparea60
  area85        Int?      // kaptMparea85
  area135       Int?      // kaptMparea135
  area136       Int?      // kaptMparea136

  // 2군 · 임장 체크리스트
  parkingGround Int?    // kaptdPcnt
  parkingUnder  Int?    // kaptdPcntu
  subwayLine    String? @db.VarChar(60)
  subwayStation String? @db.VarChar(60)
  walkSubway    String? @db.VarChar(40)  // kaptdWtimesub
  walkBus       String? @db.VarChar(40)  // kaptdWtimebus
  evGround      Int?    // groundElChargerCnt
  evUnder       Int?    // undergroundElChargerCnt
  elevator      Int?    // kaptdEcnt
  cctv          Int?    // kaptdCccnt
  builder       String? @db.VarChar(200) // kaptBcompany
  welfareFacility    String? @db.Text
  convenientFacility String? @db.Text
  educationFacility  String? @db.Text

  /// useYn. 사용중이 아닌 단지는 적재하되 매칭 대상에서 제외한다.
  /// rawJson에서 꺼내 쓰지 않고 컬럼으로 둔다 — 매칭 쿼리의 WHERE 조건이기 때문이다.
  inUse Boolean @default(true)

  /// 두 엔드포인트 응답 원본(3군 관리정보 포함). 정규화 컬럼은 여기서 파생된다.
  rawJson Json?

  propertyId BigInt?   @unique
  property   Property? @relation(fields: [propertyId], references: [id], onDelete: SetNull)
  matchTier  Int?      // 1|2, 미매칭이면 null
  matchedAt  DateTime?

  fetchedAt DateTime?  // 상세 수집 시각. NULL이면 목록만 적재된 상태
  updatedAt DateTime   @updatedAt

  @@index([sigunguCode, nameNorm])
  @@index([propertyId])
  @@index([matchTier])
}
```

`Property` 변경은 관계 한 줄(`aptComplex AptComplex?`)뿐이다. **컬럼을 추가하지 않는다.**

### 3.1 결정 기록

**3군은 컬럼으로 만들지 않는다.** 관리방식·경비·청소·소독·구조·급수·화재수신반은 `rawJson`에만 둔다. 실거래 해석에 쓰이지 않고 오히려 공공 레지스트리 복사 인상을 키운다. 보류 결정이 뒤집히면 마이그레이션 없이 꺼낼 수 있다.

**연락처류는 컬럼으로 만들지 않는다.** `kaptTel`·`kaptFax`·`kaptUrl`·`zipcode`는 `rawJson`에 원본으로 남지만 조회 경로를 뚫지 않는다. 병원·어린이집에서 같은 유형의 지적을 받았다. 실수로 화면에 새는 것을 스키마에서 막는다.

**`Property`에 아파트 전용 컬럼을 늘리지 않는다.** `Property`는 4개 유형이 공용하는 핵심 테이블이다. 컬럼 20개를 늘리면 오피스텔·연립다세대 행에 영구 NULL이 생긴다.

**`propertyId @unique`** — audit에서 충돌 0건 확인(§5.3). 한 단지가 두 Property에 붙는 것도, 한 Property에 두 단지가 붙는 것도 DB가 막는다.

**`rawJson`과 `fetchedAt`은 nullable.** 목록만 적재된 중간 상태를 표현해야 하고, `fetchedAt IS NULL`이 상세 수집의 재개 기준이 된다.

---

## 4. 수집 파이프라인

`scripts/ingest/apt-complex/{http,adapter,types,runner}.ts`. 기존 ETL 관례(`notify`·`IngestionRun`)를 따른다.

### 4.1 `--mode=list` — 목록

`getTotalAptList4`를 `numOfRows=1000`으로 페이징. **약 23회.** 시군구 순회(255회)보다 싸고, 우리 `Property`에 아직 없는 시군구의 단지도 확보한다.

`kaptCode` upsert로 목록 필드(`kaptName`·`nameNorm`·`bjdCode`·`sigunguCode`·`as3`)만 갱신한다. `LoanProduct`의 **스냅샷 교체 패턴은 쓰지 않는다** — 목록 재수집이 이미 채운 상세 필드를 날리기 때문이다. 0건이면 거부하는 가드는 가져온다.

### 4.2 `--mode=detail` — 상세

단지당 `getAphusBassInfoV5` + `getAphusDtlInfoV5`, 총 **44,596회**. 일일 한도 100,000의 45%, 약 90분, 1회 런 완주 예상.

**일일 한도를 코드에 하드코딩하지 않는다.** 배치 크기를 미리 계산하는 대신 `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`를 감지해 즉시 중단하고 `notify`한다. 재실행하면 `fetchedAt IS NULL` 기준으로 재개한다. 한도가 반영 안 됐더라도 같은 코드가 그대로 동작한다.

두 응답은 `kaptCode` 기준으로 병합해 `rawJson`에 통째로 넣고 정규화 컬럼을 파생한다. `useYn`이 사용중이 아닌 단지는 적재하되 매칭 대상에서 제외한다.

**전량 수집한다.** 매칭 확정분만 받으면 20,000회를 아낄 수 있지만, 매칭 규칙은 앞으로 바뀔 것이 확실하고(0.75 완화 검토, 정규화 개선) 그때 **API 재호출 0회로 재매칭**하는 것이 이 설계의 핵심 가치다. 한도가 넉넉하므로 그 자유도를 취한다.

### 4.3 실행

`.github/workflows/ingest-apt-complex.yml`, **`workflow_dispatch` 전용**. cron을 걸지 않는다. 세대수·동수·준공일은 거의 변하지 않고, 44,596회를 정기적으로 태울 이유가 없다. 갱신은 분기 1회 수동으로 충분하다.

박스가 아니라 Actions에서 돌린다. 90분이면 한 런에 들어가고, 박스는 dockerd가 이미 상시 부하가 있다.

---

## 5. 매칭

`--mode=match`. 수집과 완전히 분리돼 API 재호출 없이 몇 번이든 다시 돌린다.

### 5.1 정규화 파이프라인

```
normalizeName(kaptName)       // lib/slug.ts 재사용
  → 접미사 "아파트"/"apt" 제거
  → as3(동명) 접두 제거        // "잠실동트리지움" → "트리지움"
```

`Property.nameNorm`에는 **접미사 제거만** 동일 적용한다(동명 접두는 우리 이름에 거의 없다).

단계별 효과 실측 (시군구 6개, API 단지 1,128):

| 전략 | 매칭률 |
|---|---|
| 현재 `normalizeName` 그대로 | 32% |
| + 접미사 제거 | 46% |
| + 동명 접두 제거 | 48% |
| + Dice 유사도 (게이트 없음) | 71% — **오매칭 포함** |

### 5.2 계단식 판정

| Tier | 조건 | 결과 |
|---|---|---|
| **1** | `sigunguCode` 일치 + 정규화명 완전일치 + 후보 유일 | 확정 |
| **2** | `sigunguCode` 일치 + Dice ≥ **0.85** + **동명 게이트 통과** + 최고점 단독 | 확정 |
| — | 후보 복수(모호) 또는 위 미달 | **미매칭** (`matchTier = null`) |

Property 후보 조회는 `propertyType = APARTMENT AND redirectToId IS NULL AND sigunguCode = :sgg`로 좁힌다. 병합으로 리다이렉트된 패자를 빼지 않으면 생존자와 이름·지역이 같아 그대로 걸린다.

Tier 2에서 **최고점이 둘 이상 동점이면 모호로 보고 버린다.** 정규화명은 매칭 시점에 메모리에서 파생한다 — `Property.nameNorm` 컬럼을 변경하지 않는다.

`AptComplex` 쪽 조회는 `inUse = true`로 제한한다.

**동명 게이트는 타협 없는 필수 조건이다.** `Property.address` 선두에서 동명을 뽑고(`"범어동 2305"` → `"범어동"`, 추출 실패율 실측 **0%**) API `as3`와 비교한다. `수성동1가` ↔ `수성동`처럼 표기 깊이만 다른 경우는 접두 비교로 통과시킨다.

> 구현 주의 — 동명 추출 정규식에서 한글 뒤 `\b`는 동작하지 않는다(JS `\b`는 ASCII 단어 경계). 전방탐색 `(?=[\s0-9-]|$)`을 쓴다. 설계 중 이 버그로 추출이 256건 실패해 측정이 왜곡됐다.

임계값별 실측:

| 유사도 | 확정 | = 완전일치 + 유사도 | 오매칭 차단 |
|---|---|---|---|
| 0.75 | 68% | 544 + 224 | 37 |
| 0.80 | 62% | 544 + 160 | 19 |
| **0.85** | **55%** | 544 + 82 | 7 |
| 0.90 | 51% | 544 + 27 | 4 |

**0.85를 채택한다.** 이 구간의 통과·차단 사례를 사람이 전수 확인해 오매칭 0을 확인했다. 커버리지는 아파트 `Property` 기준 약 **37%**(이론 천장 50% 대비 74% 도달). 0.75로 낮추면 45%까지 오르지만 그 구간 142건의 정확도는 검증되지 않았다.

**모호하면 첫 번째를 고르지 않고 버린다.** 기존 `findOrCreateProperty`는 `'ambiguous match — picking first'`로 넘어가지만, 그건 거래 적재라 놓치면 손실이고 여기는 부가정보라 틀리면 손해다. 판단 기준이 반대다.

### 5.3 매칭 audit 결과 (2026-09-07, 시군구 17개 표본)

| 항목 | 값 |
|---|---|
| 한 `kaptCode` → Property 복수 후보 | **0건** |
| 한 Property → `kaptCode` 복수 후보 | **0건** |

"1단지/2단지 분리" 유형의 충돌이 표본에서 나오지 않았다. `@unique` 확정 근거다.

### 5.4 역채움

확정 매칭분만 `Property.households`·`buildingCount`를 갱신한다. API 값이 `null`이면 **건드리지 않는다**(덮어써서 기존 값을 지우지 않기 위해). 현재 전량 NULL이라 실질적으로 순수 추가다.

**매칭이 떨어지면 역채움도 되돌린다.** 재매칭에서 이전에 붙어 있던 Property가 미매칭이 되면 `households`·`buildingCount`를 `null`로 되돌린다. 이 두 값의 유일한 출처가 이 ETL이므로 매칭이 사라지면 근거도 사라진다. 안 지우면 잘못된 매칭으로 들어간 값이 조용히 남는다.

### 5.5 재실행 안전성

매칭은 **전량 재계산**이다. 규칙이 바뀌면 `propertyId`·`matchTier`를 다시 쓴다. `rawJson`이 남아 44,596회 재호출이 없고, `matchTier`가 남아 "규칙 A에서 붙었는데 B에서 떨어진 단지"를 diff로 감사할 수 있다.

---

## 6. 검증

### 6.1 단위 테스트 — 실측 사례를 픽스처로

```
통과  "범어센트럴푸르지오 아파트"(범어동) = "범어센트럴푸르지오"(범어동 2257)
통과  "월드메르디앙이스턴카운티"(범어동) = "범어월드메르디앙이스턴카운티"(범어동)
통과  "만촌역 태왕디아너스"(만촌동)      = "만촌역태왕디아너스"(만촌동)
차단  "프라지움1차"(두정동)    ≠ "프라지움11차아파트"(성정동)   ← 1차 vs 11차
차단  "쌍용동일하이빌"(쌍용동)  ≠ "동일하이빌"(불당동)
차단  "범어아이파크"(범어동)    ≠ "수성아이파크"(파동)
차단  "범어효성해링턴플레이스"(범어동) ≠ "수성효성해링턴플레이스"(중동)
통과  "수성동양엘레브"(수성동1가) ↔ 동명 게이트 (표기 깊이 차이)
```

어댑터: `kaptUsedate`(`"20181228"` → Date), 숫자 필드 문자열→Int, `useYn` 처리, **면적별 4칸 합 = `households`** 검산.

면적 비율은 **네 칸이 다 있고 합이 `households`와 정확히 일치할 때만** 유효로 본다. 이번 스펙은 **검산 결과를 저장하지 않는다** — 판정은 렌더 시점에 파생하면 되고, 컬럼을 늘리면 규칙이 바뀔 때 재적재가 필요해진다. 대신 `--mode=audit`이 "4칸 완비 + 합 일치" 단지 수를 리포트해 화면 스펙이 노출 규모를 알 수 있게 한다.

허용오차 완화(`±1` 또는 `≤0.1%`)는 그 리포트를 본 뒤 별도 결정한다. 처음부터 완화하지 않는다.

### 6.2 통합 테스트

시드 픽스처로 매칭을 돌려 tier가 기대대로 나오는지 확인한다.

> 게토 — `Property.sigunguCode`는 생성(generated) 컬럼이라 insert할 수 없다. `regionCode`로 유도해야 한다.

### 6.3 `--mode=audit` — 매칭 리포트

쓰기 없이 아래를 출력한다. **매칭 실행 전에 사람이 눈으로 확인하는 관문**이다.

- 매칭률, tier 1·2 분포, 모호 건수, 미매칭 상위 사례
- Tier 2로 붙은 건의 `(kaptName, as3) → (Property.name, address, 유사도)` 목록 — 오매칭 육안 검수용
- 면적별 4칸 완비 + 합 일치 단지 수 (§6.1)
- 필드별 채움률 전수 (§1.2의 36개 표본을 22,298개 전량으로 대체)

### 6.4 측정 게이트 (순서 7번) — 이 스펙의 완료 조건

역채움 전후로 `narrative.fired.length >= 3`인 아파트 페이지 수를 센다.

**기대값은 변화 0이다.**

`bScale`은 `builtYear`나 `households` 중 **하나만 있어도** 발화하고, `builtYear`는 44,479개 전부에 있다. 즉 `bScale`은 이미 100% 발화 중이고 `households` 역채움은 문장을 풍부하게 만들 뿐 `fired` 개수를 늘리지 않는다.

> ⚠️ **정정 기록.** 설계 중 "households가 채워지면 bScale이 살아나 색인 분모가 늘어난다"는 가설이 있었으나 코드 확인 결과 틀렸다. 위험은 실재하지만 발생 지점이 6번(역채움)이 아니라 8번(단지정보 해석 모듈 추가)이다.

**0이 아니면 이 분석이 틀린 것이므로 거기서 멈춘다.**

같은 자리에서 하나 더 측정한다 — `INDEX_SIGNAL_KEYS` 화이트리스트로 바꿨을 때 **색인에서 빠지는 페이지 수**. 실제 전환은 후속 스펙이지만 규모를 지금 알아야 그 스펙을 안전하게 짤 수 있다.

---

## 7. 후속 스펙에 넘기는 계약

> **단지정보에서 파생된 어떤 해석 모듈도 `isNarrativeIndexable` 판정에 들어가지 않는다.**
> 색인 신호는 실거래 기반 키의 화이트리스트로만 센다.

현재 `lib/seo/indexable.ts`는 `narrative.fired.length >= 3`으로 **모든 발화 모듈을 통째로** 센다. 단지정보 모듈을 그냥 추가하면 지금까지 발화 2개로 `noindex`였던 페이지가 자동으로 색인 대상이 된다. AdSense 재심사 중에 색인 분모가 커지는 것은 위험한 방향이다.

후속 스펙은 이렇게 바꾼다.

```ts
const INDEX_SIGNAL_KEYS = ['trend', 'peer', 'floor', 'flags'];  // 실거래 기반만
isNarrativeIndexable(n, 3)
  → n.fired.filter(k => INDEX_SIGNAL_KEYS.includes(k)).length >= 3
```

기본이 "색인에 안 들어감"인 화이트리스트를 쓴다. 새 모듈을 추가할 때마다 판단이 필요한 blacklist보다 사고를 덜 낸다.

**주의 — 이 전환은 색인 분모를 줄인다.** 현재 `scale`(100% 발화)과 `access`가 카운트에 들어가 있어, `trend`+`peer`만 있고 `scale`로 3을 채우던 페이지가 2로 내려간다. AdSense 관점에선 유리한 방향이지만 규모를 §6.4에서 먼저 재고 판단한다.

또한 화면에 실을 때 `AptComplex.fetchedAt`을 근거로 `SourceCaption`에 기준일을 표기해야 한다 — *"국토교통부 공동주택 단지정보 · 2026-09-07 수집"*. 수동 갱신이라 데이터는 마지막 수집 시점 기준이다.

---

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| API 타임아웃 43% 실측 | 지수 백오프 재시도 3회. 실패분은 `IngestionRun`에 남겨 다음 회차 재시도 |
| 일일 트래픽 한도 미반영 | 한도 초과 응답 감지 → 중단·재개. 코드가 한도 수치에 의존하지 않음 |
| 매칭 커버리지 37%가 기대에 못 미침 | 미매칭분 `rawJson` 보존. 규칙 개선 시 API 재호출 없이 재매칭 |
| 오매칭으로 다른 단지 정보 노출 | 동명 게이트 필수 + 모호 시 버림. `matchTier` 보존으로 사후 감사 |
| 목록 재수집이 상세를 날림 | 스냅샷 교체 금지, 목록 필드만 upsert |
| 색인 분모 증가 | §6.4 측정 게이트 + §7 계약. 이번 스펙은 화면 노출 0 |

---

## 9. 이번 스펙이 하지 않는 것

- 화면 렌더 (섹션·해석 문장·레이아웃)
- `isNarrativeIndexable` 변경 (측정만)
- 연립다세대·오피스텔 매칭 (아파트만)
- 지역 평균·유사 단지 백분위 비교
- 3군 필드의 컬럼화
- 런타임 외부 API 호출 — 전량 사전 수집이다
