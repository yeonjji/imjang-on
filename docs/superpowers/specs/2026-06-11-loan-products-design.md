# 주거금융 — 서민금융 대출상품 리스트+상세 설계

**작성일:** 2026-06-11
**브랜치:** `feat/loan-products`
**데이터:** 서민금융진흥원 대출상품한눈에 (data.go.kr 15106208, 기관코드 B553701)

## 배경

`주거금융` 카테고리의 첫 기능. (직전 HF 전세자금대출 금리 기능은 discard됨 — [별도 spec 참조](2026-06-11-housing-finance-hf-rent-loan-rate-design.md).)

기존 imjang-on 카테고리는 전부 좌표 기반 "근처 인프라"지만, 대출상품은 **좌표 없는 전국 단위 참조 데이터**다. 단 HF 금리(은행 6곳·숫자뿐)와 달리 **323개 상품 × 64필드**로 풍부해, **리스트+상세 패턴**이 정당화된다.

### 실측으로 확인한 사실 (라이브 호출)

- **호출 경로:** `https://apis.data.go.kr/B553701/LoanProductSearchingInfo/LoanProductSearchingInfo/getLoanProductSearchingInfo` — 서비스명이 **2회 반복**된다(가이드 없음, 실측으로 발견). 단일/getList 등은 모두 404.
- **응답:** XML, `<response><header><resultCode>00</resultCode>…</header><body><items><item>…`. `totalCount=323`, `numOfRows`/`pageNo` 페이지네이션. (HF 어댑터의 `assertNormalResponse`/`getItems` 재사용 가능)
- **갱신주기:** 연 1회(데이터포털 명시).
- 상품당 64필드 — 다수는 표시용이 아닌 **패세트/검색용 boolean 플래그**(`age39blw`, `crdtsc1~9`, `lnlmt*abnml`, `incmcnd*`).

## 확정된 설계 결정

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| 1 | 노출 범위 | 리스트+상세는 **전체 323개** | 서민금융 전체 카탈로그 |
| 2 | 매물/실거래가 노출 | **후속 단계**(주택 관련만 필터) | 이번 범위 밖. 데이터는 전량 수집 |
| 3 | 리스트 탐색 | **다중 패세트**(용도·기관·지역·대상) + 검색 | 323개·다축 데이터 |
| 4 | URL | `/finance`=리스트, `/finance/[seq]`=상세 | 단일 데이터셋, 허브 분리는 YAGNI |
| 5 | 상세 깊이 | **풍부 + 원문 링크** | North Star "공공기록의 열람실" |
| 6 | 아키텍처 | DB + ISR + **클라이언트 패세트** | 작고 정적(323행·연1회) → 즉시 필터·SEO·DB 일관 |

## 1. 데이터 모델 (Prisma)

64필드 중 표시·정렬·패세트에 쓰는 것만 컬럼화하고, 나머지 전부는 `rawJson`에 보존(기존 `SubscriptionNotice.rawJson` 패턴).

```prisma
model LoanProduct {
  seq         Int      @id              // API 자연키
  finprdnm    String   @db.VarChar(200) // 상품명
  ofrinstnm   String?  @db.VarChar(120) // 제공기관
  instCtg     String?  @db.VarChar(40)  // 기관구분(패세트)
  lnlmt       Int?                       // 한도(만원) — 정렬용
  irt         String?  @db.VarChar(60)   // 금리(텍스트)
  irtCtg      String?  @db.VarChar(40)   // 금리구분
  usageTags   String[]                   // 정규화 자금용도 태그(패세트)
  targetTags  String[]                   // 정규화 대상 태그(패세트)
  regionTags  String[]                   // 정규화 시도 태그(전국 포함, 패세트)
  rawJson     Json                       // 전체 원본 — 상세 페이지 표시용
  updatedAt   DateTime @default(now())

  @@index([finprdnm])
}
```

- 리스트 쿼리: 요약 컬럼만 select(`rawJson` 제외, 페이로드 절감).
- 상세 쿼리: `seq`로 `rawJson` 포함 단건 조회.
- 패세트는 클라이언트 메모리 처리 → 배열에 GIN 인덱스 불필요.
- 좌표·지역 FK 없음. 다른 모델과 관계 없음 → 조작이 타 데이터에 파급되지 않음.

## 2. 필드 → 화면 매핑

표시 가능한 텍스트 필드(상세 페이지). 플래그 필드는 비표시.

| 영문 | 의미 | 용도 |
|---|---|---|
| `seq` | 식별자 | PK·상세 라우트 |
| `finprdnm` | 상품명 | 리스트·상세·검색 |
| `ofrinstnm` | 제공기관 | 리스트·상세 |
| `instCtg` | 기관구분(공공기관·재단/사단법인·시중은행·지자체·상호금융·민간기업…) | **패세트** |
| `lnlmt` | 대출한도(만원) | 리스트·정렬·상세 |
| `irt` / `irtCtg` | 금리 / 금리구분(변동·고정) | 리스트·상세 |
| `maxtotlntrm`/`maxdfrmtrm`/`maxrdpttrm` | 최대 총/거치/상환기간 | 상세(한눈에) |
| `rdptmthd` | 상환방식 | 상세(한눈에) |
| `usge` | 자금용도(콤마 다값) | **패세트**(`usageTags`로 정규화) |
| `trgt` | 대출대상(콤마 다값) | **패세트**(`targetTags`) |
| `rsdAreaPamtEqltIstm` | 거주지역 제한(시·도, 콤마 다값, "전국") | **패세트**(`regionTags`) |
| `suprtgtdtlcond` | 지원대상 상세조건 | 상세(자격) |
| `age`/`incm`/`crdtsc` | 연령/소득/신용 조건(텍스트) | 상세(자격) |
| `housholdcnt` | 가구수 조건 | 상세(자격) |
| `grninst` | 보증기관 | 상세(비용·우대) |
| `rpymdcfe`/`lnicdcst`/`ovitryr` | 중도상환수수료/부대비용/연체이율 | 상세(비용·우대) |
| `prftaddirtcond` | 우대금리조건 | 상세(비용·우대) |
| `etcrefsbjc` | 기타참고사항 | 상세 |
| `jnmthd` | 가입방법 | 상세(신청) |
| `hdlinst`/`hdlinstdtlvw` | 취급기관/상세 | 상세(신청) |
| `cnpl` | 고객센터 | 상세(신청) |
| `rltsite` | 관련사이트 URL | 상세(신청, **원문 링크**) |

> 비표시 플래그(패세트 보조): `lnlmt*abnml`, `age39blw`/`age40abnml`/`age60abnml`, `crdtsc1~9`/`crdtsc0`/`crdtsc15`/`crdtsc60`, `incmcnd*`, `tgtFltr`, `prdCtg`, `kinfaprdyn` 등. 모두 `rawJson`에 보존하되 화면엔 쓰지 않는다.

## 3. ETL (`scripts/ingest/loan/`)

기존 `subscriptions/`·`amenities/` 폴더 패턴.

- **`types.ts`** — `LoanProductRow`(요약 컬럼 + `rawJson`), `LOAN_INGEST_SOURCE = 'kinfa-loan'`
- **`normalize.ts`**(순수, 단위테스트 대상)
  - `usge`/`trgt`/`rsdAreaPamtEqltIstm`를 콤마 분리 → 트림 → 빈값/"-" 제거 → 접미사 "등" 제거 → dedup → 태그 배열
  - 예: `"근로자, 사업자, 연금소득자"` → `["근로자","사업자","연금소득자"]`; `"금융취약계층 등"` → `["금융취약계층"]`
- **`http.ts`** — 2회반복 경로, `numOfRows=100`·`pageNo` 순회(323→4페이지), `dataType=XML`, `env.PUBLIC_DATA_KEY`, HF http 재시도 패턴
- **`adapter.ts`** — `parseXml`/`getItems`/`assertNormalResponse`(상위 `xml-parse.ts`) 재사용. item → `LoanProductRow`. `lnlmt`는 숫자 변환, 나머지 요약 컬럼 매핑, 태그 정규화, 원본 객체를 `rawJson`에 보존
- **`runner.ts`** — `IngestionRun`(source=`kinfa-loan`) + 전 페이지 fetch → **원자 스냅샷 교체**(단일 `$transaction`의 deleteMany+createMany, **0건이면 거부**) → `revalidatePaths(['/finance'])` → `notify`
- **`package.json`** — `ingest:loan` 스크립트
- **cron** — 월 1회(`.github/workflows/ingest-loan.yml`). 원본은 연 1회 갱신이나 안전 마진.

### 수집 격리
HF 설계와 동일: `LoanProduct` 테이블에만 쓰기, 원자 교체, fetch 실패 시 기존 스냅샷 유지(0건 거부), 독립 `IngestionRun`, `/finance`만 revalidate, 전용 워크플로.

## 4. 출처 레지스트리 (`lib/data-sources.ts`)

- `DataSourceId`에 `'kinfa-loan'`
- `DataSourceCategory`에 `'주거금융'`(+ `DATA_SOURCE_CATEGORY_ORDER` 청약 다음, `CATEGORY_ICON` `🏦`)
- 엔트리: provider `서민금융진흥원`, dataset `대출상품한눈에`, url `https://www.kinfa.or.kr`, category `주거금융`

## 5. 리스트 페이지 `/finance`

ISR(`export const revalidate`). 서버 컴포넌트가 요약 전량(323) 조회 → 초기 HTML에 전체 렌더(SEO) → 클라이언트 `<LoanExplorer>`에 전달.

- **`lib/loan/list.ts`** — `getLoanSummaries()`(요약 컬럼 findMany) + `collectFacets(rows)`(용도·기관·지역·대상 고유값+카운트, 순수)
- **`<LoanExplorer>`**(클라이언트) — 다중 패세트(체크박스) + 상품명 검색 + 정렬(한도 내림/오름). 필터는 메모리 즉시. 패세트 상태를 URL searchParams에 동기화(`replaceState`)해 공유 가능
- **필터 순수 함수** `filterLoans(rows, criteria)` — 단위테스트 대상(선택 태그 AND/OR 규칙: 같은 패세트 내 OR, 패세트 간 AND)
- 각 행: 상품명·제공기관·한도·금리·용도태그 → `/finance/[seq]`
- 상단 안내 1줄("서민금융진흥원이 모은 정부·정책·지자체·민간 대출상품…") + `SourceCaption(['kinfa-loan'])`
- 반응형: 데스크톱 좌측 패세트 + 우측 리스트, 모바일 상단 필터 드로어/접이식 + 카드 리스트
- `lib/sitemap/static-entries.ts`에 `/finance` 추가

## 6. 상세 페이지 `/finance/[seq]`

ISR + `generateStaticParams`(전 seq). `lib/loan/detail.ts`의 `getLoanProduct(seq)`가 `rawJson` 포함 조회. **풍부 + 원문 링크**:

- **헤더** — 상품명, 제공기관, 기관구분 배지, 용도·대상 태그
- **한눈에** — 한도·금리(+구분)·총/거치/상환기간·상환방식
- **자격요건** — 대상·지원대상 상세조건·연령·소득·신용·거주지역·가구수
- **비용·우대** — 중도상환수수료·부대비용·연체이율·우대금리조건·보증기관
- **신청** — 가입방법·취급기관·고객센터·**관련사이트 링크**(`rltsite` 외부 링크)
- 값이 "-"/"없음"/빈값인 필드는 렌더 생략(필드라벨 맵 + 빈값 가드)
- 추정·계산 없음. `SourceCaption(['kinfa-loan'])`. 메타데이터·OG

## 7. 테스트

- **normalize**(순수) — 콤마 분리·"등" 제거·빈값/"-" 제거·dedup
- **adapter**(픽스처 XML) — item→row, `lnlmt` 숫자화, 태그 매핑, rawJson 보존, 다페이지, `resultCode` 에러
- **filterLoans**(순수) — 패세트 내 OR·패세트 간 AND, 검색, 정렬
- **collectFacets**(순수) — 고유값·카운트
- **snapshot 교체**(통합, `.env.test` docker) — 멱등·0건 거부
- 검증은 `.env.test`(프로젝트 규칙)

## 8. 범위 밖 (명시)

- 실거래가/매물 상세에 **주택 관련 대출 노출**(결정 #2) — 후속. 데이터는 이번에 전량 수집
- region 페이지 ↔ 지역 제한 상품 심층 연동 — 후속
- HF 전세자금대출 금리 — discard됨, 별도 spec
- 페이지네이션/가상스크롤 — 323개 전량 렌더로 충분(YAGNI)

## 9. 미해결/주의

- 일부 필드 의미 불확실(`anin`, `housar`, `lntgthous`, `rfrccnpl`, `prdoprprid`) — 표시 안 함, `rawJson`에 보존. 필요시 추후 라벨 추가
- `lnlmt` 단위는 만원(예 `2000`=2,000만원)으로 보이나 첫 실수집에서 재확인
- `irt`는 텍스트(`"~19.99"`, `"3"`, `"0"`) — 숫자 파싱하지 않고 원문 표시

## 부록 A. 실제 응답 샘플 1건 (seq=8)

```xml
<item>
  <seq>8</seq>
  <finprdnm>사잇돌Ⅱ대출_대환형</finprdnm>
  <lnlmt>2000</lnlmt>
  <irtCtg>변동금리</irtCtg>
  <irt>~19.99</irt>
  <maxtotlntrm>5(최대 60개월, 보증기간 이내)</maxtotlntrm>
  <maxdfrmtrm>0</maxdfrmtrm>
  <maxrdpttrm>5</maxrdpttrm>
  <rdptmthd>원(리)금균등분할상환</rdptmthd>
  <usge>생계</usge>
  <trgt>근로자, 사업자, 연금소득자</trgt>
  <instCtg>민간기업</instCtg>
  <ofrinstnm>SGI서울보증</ofrinstnm>
  <rsdAreaPamtEqltIstm>전국</rsdAreaPamtEqltIstm>
  <suprtgtdtlcond>중저신용 거래자로, 소득수준 요건 등에 해당하는 자 (개별 취급 금융기관 문의)</suprtgtdtlcond>
  <age>없음</age> <incm>없음</incm> <crdtsc>없음</crdtsc>
  <grninst>SGI서울보증보험</grninst>
  <jnmthd>취급 금융기관 방문, 서금원 맞춤대출 조회</jnmthd>
  <rpymdcfe>없음</rpymdcfe>
  <etcrefsbjc>- 재직근로자의 대학학자금 : 거치기간 연 1.0%, 상환기간 연 3.0%</etcrefsbjc>
  <hdlinst>저축은행</hdlinst>
  <cnpl>취급 저축은행 콜센터, 서민금융콜센터 (국번없이) 1397</cnpl>
  <rltsite>https://www.fsb.or.kr</rltsite>
  <!-- 외 플래그 필드(age39blw, crdtsc1~9, lnlmt*abnml 등)는 rawJson 보존 -->
</item>
```
