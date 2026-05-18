# imjang-on — 공공데이터 부동산 실거래가 통합 정보 플랫폼 (Phase 1 설계)

| 항목 | 값 |
|------|-----|
| 작성일 | 2026-05-18 |
| 상태 | Draft v1 — 사용자 리뷰 대기 |
| 작성자 | jiyeonjeong (브레인스토밍 진행), Claude (작성) |
| 다음 단계 | 사용자 spec 리뷰 → writing-plans로 구현 계획 작성 |
| 원본 기획서 | `/Users/jiyeonjeong/Downloads/realestate-platform-plan.docx` |
| HTML 시안 | `./html/main.html`, `list.html`, `detail.html` |

---

## 1. 프로젝트 개요

### 1.1 컨셉

공공데이터 기반으로 **실거래가·청약·생활 인프라·금융 정보를 상세페이지 한 곳에 연결**하는 부동산 정보 플랫폼. 단순 조회형이 아니라 "이 부동산에 살면 어떤 생활이 가능한지", "이 청약이 실제로 얼마나 유리한지"를 보여주는 상세 중심 서비스.

### 1.2 풀 비전 (기획서 5순위 우선순위)

1. 실거래가 상세 ↔ 청약 상세 상호 연결
2. 학교/편의시설/공원/시장/주차장/충전소 위치 기반 연결
3. 전세대출 금리·보증상품 추천 연결
4. 지역별 생활권 요약 콘텐츠 자동 생성
5. 지도 기반 통합 탐색 화면

### 1.3 서비스명·도메인

- 한글 표기: **임장온**
- 영문 표기: **imjang-on**
- 로고: 한글 "임장온" + 아이콘 (집 모티프)
- 도메인: 미정 (`imjang-on.com`/`.co.kr` 등 후속 확정)

---

## 2. Phase 1 범위 (확정)

### 2.1 포함 ✅

| 영역 | 내용 |
|------|------|
| **부동산 유형** | 아파트, 오피스텔, 연립·다세대 (3종) |
| **거래 유형** | 매매, 전세, 월세 (전체 3종) |
| **지역 범위** | 전국 (252개 시군구) |
| **수집 기간** | **최근 1년치**만 백필 |
| **지역 코드** | 법정동코드 (행정안전부 데이터) |
| **단지 좌표** | 카카오 로컬 API로 신규 단지 발견 시 지오코딩 |
| **지도** | 상세페이지 정적 지도 위젯 (카카오 SDK) |
| **렌더링** | ISR 중심 (검색/목록만 SSR) |
| **읽기 전용** | 인증·즐겨찾기 없음. 모든 페이지 공개 |

### 2.2 제외 (Phase 2 이후로 분리) ⏸

- 청약 데이터 (`data.go.kr 15098547` 등)
- POI 7종 (학교·마트·병원·약국·공원·시장·주차장·충전소)
- 단독다가구·토지
- 회원 가입, 즐겨찾기, 알림
- 전세대출·금융 상품 정보
- 지도 기반 통합 탐색 (5순위)
- 다단계 평형별 집계 (Phase 1은 단지 전체 평균만)

### 2.3 데이터 볼륨 추정 (Phase 1)

| 테이블 | row 수 | 용량 |
|--------|-------|------|
| Region | ~50,000 (법정동, 폐지 포함) | ~4 MB |
| Property | ~30,000~50,000 (전국 단지/건물) | ~10 MB |
| **Transaction** | **2,800,000~4,400,000** (1년치) | ~250 MB |
| 인덱스 (×1.5) | — | ~400 MB |
| **합계** | — | **~650 MB** |

→ **Supabase Free Tier(500MB) 빠듯하나 가능**. 운영 시작 후 임계점 도달 시 Pro로 전환.

### 2.4 백필 일정

- 호출 수: 252 시군구 × 12개월 × 6 API = ~19,500 호출 (페이징 반영)
- 개발키(API별 1,000/일) 한도: API별 ~3,300 호출 → **4일 병렬 실행**
- 운영계정 신청 불필요 (출시 일정 단축)

---

## 3. 기술 스택 (확정)

### 3.1 런타임

- **Next.js 15** (App Router) + **React 19**
- **TypeScript 5** (strict)
- **Node 20** (`.nvmrc`)
- **pnpm** 패키지 매니저

### 3.2 데이터

- **PostgreSQL** (via **Supabase Pro** $25/월 — Free Tier로 시작, 임계점 전환)
- **PostGIS** 확장 (좌표 기반 주변검색)
- **pg_trgm** 확장 (단지명·지역명 자동완성)
- **Prisma 5** ORM (provider=`postgresql`)
- PostGIS 관련은 `prisma.$queryRaw`로 처리

### 3.3 호스팅 & 스케줄러

- **Vercel** Hobby 무료 티어 (Next.js 호스팅, ISR, OG 이미지)
- **GitHub Actions** 무료 티어 (cron ETL, 백필, 백업)

### 3.4 UI

- **Tailwind CSS v4** (`@theme` 토큰으로 HTML 시안의 CSS 변수 이식)
- **Radix UI primitives** 선택 도입 (`react-dropdown-menu`, `react-dialog`)
- **vaul** 모바일 바텀시트
- **lucide-react** 아이콘
- **Recharts** 가격 추이 미니차트
- **clsx** + **tailwind-merge** 클래스 조합
- shadcn/ui 전체 도입은 안 함 (시안 디자인 차이)

### 3.5 외부 API

- **공공데이터포털** (data.go.kr) 서비스키 — 개발계정
- **카카오 로컬 API** — REST 키 (개인, 일 30만 무료)
- **카카오 지도 SDK** — JavaScript 키 (도메인 등록 필요)

### 3.6 관측

- **Sentry** (free 5K errors/월)
- **Google Analytics 4** (AdSense 연동 필수)
- **Vercel Analytics + Speed Insights**
- **Google Search Console** + **네이버 Search Advisor**
- **UptimeRobot** (free 50 monitors)
- **Discord Webhook** (ETL 알림)
- **pino** 구조화 로깅

### 3.7 테스트

- **Vitest** (단위·통합)
- **Playwright** (E2E)
- **Docker postgis/postgis:16-3.4** (CI/로컬 통합 테스트)

---

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                          사용자 (한국 웹/모바일)                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Vercel  (Next.js App Router · ISR · Edge · OG Image · Analytics)   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Postgres Wire Protocol (Prisma)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase Postgres + PostGIS + pg_trgm                              │
│  Region · Property · Transaction · IngestionRun                      │
└──────────────────────────────▲──────────────────────────────────────┘
                               │ Upsert
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  GitHub Actions Workflows                                            │
│  • ingest-transactions-daily.yml  매일 03:00 KST                     │
│  • backfill-transactions.yml      수동 (1년 백필 × 4일)               │
│  • seed-regions.yml               1회 + 연간                          │
│  • pg-dump-backup.yml             주 1회 백업                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  공공데이터포털 (apis.data.go.kr/1613000/...) ─ 실거래가 6 API         │
│  행정안전부 (code.go.kr / data.go.kr 15077871) ─ 법정동코드             │
│  카카오 (dapi.kakao.com/v2/local) ─ 주소→좌표 지오코딩                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 책임 분리

| 컴포넌트 | 책임 | 책임 아님 |
|---------|------|----------|
| Vercel (Next.js) | 페이지 렌더링·캐싱·CDN·OG | 데이터 수집 |
| Supabase | 데이터 영속·인덱스·지리쿼리·백업 | 비즈니스 로직 |
| GitHub Actions | 주기적 ETL·백업 | 사용자 트래픽 |
| 카카오 로컬 API | 주소→좌표 변환 | 데이터 마스터 보관 |

### 4.2 페이지 요청 흐름

1. 사용자 → Vercel Edge
2. 페이지가 ISR 캐시에 있으면 즉시 응답 (대부분의 상세페이지)
3. 캐시 미스면 Server Component가 `lib/*` 헬퍼 호출 → Prisma로 Supabase 쿼리 → HTML 렌더 → 캐시 적재
4. 검색·필터·주변쿼리는 Server Action 또는 `app/api/*` Route Handler

### 4.3 일일 데이터 갱신 흐름

1. GitHub Actions cron 03:00 KST 트리거 (매트릭스: 6 API)
2. `scripts/ingest/transactions/runner.ts`가 250 시군구 × 현재월·지난월 루프
3. apis.data.go.kr 호출 → XML 파싱 → adapter로 NormalizedRow 변환
4. Property 매칭 (3단계) → 신규 시 카카오 지오코딩
5. Transaction `upsert` by `rawHash` (중복 방지)
6. Property 집계 컬럼 갱신 (txCount·평균가·최근거래 등)
7. 영향받은 propertyId → POST `/api/revalidate` → ISR 즉시 재생성

### 4.4 좌표 기반 주변검색 흐름

1. 상세페이지 진입 → Server Component가 단지 좌표로 `getNearbyProperties` 호출
2. `lib/nearby.ts`가 `prisma.$queryRaw`로 PostGIS `ST_DWithin` 실행 (반경 2km)
3. 같은 유형의 인근 단지 10개를 거리순 반환
4. ISR 캐시에 포함되어 다음 요청부터 캐시 hit

---

## 5. 데이터 모델 (Prisma Schema)

### 5.1 전체 schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // PostGIS / pg_trgm은 별도 SQL 마이그레이션으로 활성화
}

// ─── 지역 (법정동코드) ─────────────────────────────────────────
model Region {
  code         String   @id @db.VarChar(10)   // 법정동 10자리
  sido         String   @db.VarChar(20)        // 시도명
  sigungu      String?  @db.VarChar(40)        // 시군구명
  eupmyeondong String?  @db.VarChar(40)        // 읍/면/동
  ri           String?  @db.VarChar(40)        // 리
  fullName     String   @db.VarChar(120)        // "서울특별시 종로구 청운동"
  level        Int                              // 1=시도, 2=시군구, 3=읍면동, 4=리
  parentCode   String?  @db.VarChar(10)
  parent       Region?  @relation("RegionTree", fields: [parentCode], references: [code])
  children     Region[] @relation("RegionTree")

  isAbolished   Boolean   @default(false)
  abolishedAt   DateTime? @db.Date
  sourceVersion String    @db.VarChar(20)       // "2026-Q1"
  updatedAt     DateTime  @updatedAt

  properties    Property[]
  // sigunguCode 5자리는 generated column (SQL 마이그레이션)

  @@index([sido, sigungu, eupmyeondong])
  @@index([level, isAbolished])
}

// ─── 부동산 단지/건물 마스터 ─────────────────────────────────
enum PropertyType {
  APARTMENT
  OFFICETEL
  ROW_HOUSE
  MULTIPLEX
}

model Property {
  id            BigInt       @id @default(autoincrement())
  propertyType  PropertyType
  name          String       @db.VarChar(80)
  nameNorm      String       @db.VarChar(80)    // 공백·특수문자 제거 정규화
  regionCode    String       @db.VarChar(10)
  region        Region       @relation(fields: [regionCode], references: [code])
  // sigunguCode는 generated column LEFT(regionCode, 5)
  address       String       @db.VarChar(200)
  // location: PostGIS geography(Point, 4326) — SQL 마이그레이션으로 추가
  builtYear     Int?
  households    Int?
  buildingCount Int?
  areaTypes     Int[]        @default([])       // 실제 거래 평형 (평 단위)

  // ─── Phase 1 집계 (ETL 마지막 단계에서 갱신) ───
  txCountTotal       Int       @default(0)
  txCount12m         Int       @default(0)
  lastTxAt           DateTime?

  saleCount12m       Int       @default(0)
  saleAvgPrice12m    BigInt?
  saleLastPrice      BigInt?
  saleLastAt         DateTime? @db.Date

  jeonseCount12m     Int       @default(0)
  jeonseAvgDeposit12m BigInt?
  jeonseLastDeposit  BigInt?
  jeonseLastAt       DateTime? @db.Date

  wolseCount12m      Int       @default(0)
  wolseAvgDeposit12m BigInt?
  wolseAvgRent12m    Int?
  wolseLastDeposit   BigInt?
  wolseLastRent      Int?
  wolseLastAt        DateTime? @db.Date

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  transactions  Transaction[]

  @@index([propertyType, regionCode])
  @@index([name])
  @@index([propertyType, lastTxAt(sort: Desc)])
}

// ─── 실거래 ──────────────────────────────────────────────
enum DealType { SALE JEONSE WOLSE }

model Transaction {
  id            BigInt       @id @default(autoincrement())
  propertyId    BigInt
  property      Property     @relation(fields: [propertyId], references: [id])
  propertyType  PropertyType                    // denormalize
  regionCode    String       @db.VarChar(10)    // denormalize
  sigunguCode   String       @db.VarChar(5)     // denormalize

  dealType      DealType
  contractDate  DateTime     @db.Date
  exclusiveArea Decimal      @db.Decimal(6,2)
  floor         Int?
  buildYear     Int?

  // 매매 전용
  dealAmount    Int?                            // 거래금액 (만원, 쉼표 파싱)
  registerDate  DateTime?    @db.Date
  dealingType   String?      @db.VarChar(20)
  buyerType     String?      @db.VarChar(20)
  sellerType    String?      @db.VarChar(20)
  cancelDate    DateTime?    @db.Date
  cancelType    String?      @db.VarChar(20)

  // 전월세 전용
  deposit       Int?                            // 보증금 (만원)
  monthlyRent   Int?                            // 월세 (만원, 전세는 0)
  contractTerm  String?      @db.VarChar(20)
  contractType  String?      @db.VarChar(20)
  useRRRight    Boolean?
  preDeposit    Int?
  preMonthlyRent Int?

  // 위치·메타
  umd           String?      @db.VarChar(40)
  jibun         String?      @db.VarChar(40)
  roadName      String?      @db.VarChar(120)
  source        String       @db.VarChar(30)
  externalKey   String?      @db.VarChar(80)
  rawHash       String       @db.Char(64)       // 중복 검출 SHA-256

  @@unique([rawHash])
  @@index([propertyId, dealType, contractDate(sort: Desc)])
  @@index([propertyId, contractDate(sort: Desc)])
  @@index([sigunguCode, propertyType, dealType, contractDate(sort: Desc)])
  @@index([regionCode, contractDate(sort: Desc)])
  @@index([propertyType, contractDate(sort: Desc)])
}

// ─── ETL 적재 추적 ────────────────────────────────────────
enum IngestionStatus { RUNNING OK ERROR }

model IngestionRun {
  id           BigInt          @id @default(autoincrement())
  source       String          @db.VarChar(40)  // "molit-apt-trade" 등
  targetKey    String          @db.VarChar(40)  // "11650-202604"
  status       IngestionStatus
  rowsUpserted Int             @default(0)
  errorMessage String?         @db.Text
  startedAt    DateTime        @default(now())
  finishedAt   DateTime?

  @@index([source, targetKey])
  @@index([status, startedAt(sort: Desc)])
}

// ─── Phase 2 알림 이메일 수집 (인증 없이) ────────────────
model EmailSignup {
  id        BigInt   @id @default(autoincrement())
  email     String   @unique @db.VarChar(120)
  topic     String   @db.VarChar(40)  // "subscription" | "life-infra" | "loan"
  createdAt DateTime @default(now())

  @@index([topic])
}
```

### 5.2 SQL 마이그레이션 (Prisma가 표현 못 하는 것)

```sql
-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Region.sigunguCode generated column
ALTER TABLE "Region"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT(code, 5)) STORED;
CREATE INDEX region_sigungu_code_idx ON "Region"("sigunguCode");

-- Property.sigunguCode generated column
ALTER TABLE "Property"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT("regionCode", 5)) STORED;
CREATE INDEX prop_sigungu_code_idx ON "Property"("sigunguCode");
CREATE INDEX prop_type_sgg_lasttx ON "Property"("propertyType", "sigunguCode", "lastTxAt" DESC);

-- Property.location PostGIS column
ALTER TABLE "Property"
  ADD COLUMN location geography(Point, 4326);
CREATE INDEX prop_location_gix ON "Property" USING GIST (location);

-- pg_trgm 인덱스
CREATE INDEX prop_name_trgm   ON "Property" USING GIN ("nameNorm" gin_trgm_ops);
CREATE INDEX region_full_trgm ON "Region"   USING GIN ("fullName" gin_trgm_ops);
```

### 5.3 설계 의도

| 결정 | 이유 |
|------|------|
| `Apartment` → `Property` + `propertyType` | 아파트·오피스텔·연립다세대 공통 모델. enum으로 분기. |
| 연립·다세대를 `ROW_HOUSE`/`MULTIPLEX`로 분리 | 국토부 응답의 `houseType` 필드와 1:1 매핑 |
| `Region` 트리 구조 | 시도→시군구→읍면동→리 부모-자식. 폐지 코드 추적 위해 `isAbolished` |
| 5자리 시군구코드 generated column | 국토부 API가 5자리 호출. substring 매번보다 인덱스 효율↑ |
| Transaction의 `regionCode`/`sigunguCode` denormalize | 필터링·정렬 시 Property JOIN 비용 회피. 변경 빈도 낮아 안전 |
| Transaction의 `rawHash` unique | 공공API에 영구 ID 없어 정규화 SHA-256으로 중복 방지 |
| Property에 13개 집계 컬럼 denormalize | list 카드의 가장 핫한 쿼리에서 GROUP BY 회피 |
| `IngestionRun` 별도 테이블 | 시군구·월 단위 ETL 상태 추적, 실패 재시도 단위 |
| `EmailSignup` | Phase 2 출시 알림용. 인증 없이 작동 |

---

## 6. 공공데이터 소스 (확정 리서치 결과)

### 6.1 실거래가 API 6종 (apis.data.go.kr/1613000/...)

| # | 유형 | 거래 | 데이터셋 | Operation |
|---|------|------|---------|----------|
| 1 | 아파트 | 매매 | 15126469 | `getRTMSDataSvcAptTradeDev` |
| 2 | 아파트 | 전월세 | 15126474 | `getRTMSDataSvcAptRent` |
| 3 | 오피스텔 | 매매 | 15126464 | `getRTMSDataSvcOffiTrade` |
| 4 | 오피스텔 | 전월세 | 15126475 | `getRTMSDataSvcOffiRent` |
| 5 | 연립다세대 | 매매 | 15126467 | `getRTMSDataSvcRHTrade` |
| 6 | 연립다세대 | 전월세 | 15126473 | `getRTMSDataSvcRHRent` |

**호출 사양**:
- 인증: `serviceKey` (URL 인코딩)
- 필수 파라미터: `LAWD_CD` (시군구 5자리), `DEAL_YMD` (YYYYMM)
- 페이징: `numOfRows=1000` (최대), `pageNo` 루프
- 응답: **XML 표준** (`fast-xml-parser` 사용)
- 호출 제한: API별 1,000/일 (개발계정)
- 역사 범위: 매매 2006~, 전월세 공식 2021-06~

**필드 매핑** (어댑터별):
- 아파트: `aptNm`, `aptDong`, `aptSeq`
- 연립다세대: `mhouseNm`, `houseType`, `landAr`
- 매매 전용: `dealAmount`, `rgstDate`, `dealingGbn`, `buyerGbn`, `slerGbn`, `cdealType`, `cdealDay`
- 전월세 전용: `deposit`, `monthlyRent`, `contractTerm`, `contractType`, `useRRRight`, `preDeposit`, `preMonthlyRent`
- 공통: `excluUseAr`, `floor`, `buildYear`, `dealYear/Month/Day`, `umdNm`, `jibun`, `roadNm`, `sggCd`

**주의사항**:
- `dealAmount`는 `"12,500"` 형태 문자열 → 쉼표 제거 후 정수 변환
- 전월세 `monthlyRent=0`이면 전세, `>0`이면 월세
- 전월세에는 동·호수 비공개 (개인정보)
- 일부 큰 시군구·월은 1000건 초과 → 페이징 필요

### 6.2 법정동코드

| 항목 | 값 |
|------|-----|
| 공공데이터포털 API | 15077871 |
| 공공데이터포털 파일 | 15063424 |
| 직접 다운로드 | code.go.kr (TXT 압축) |
| 컬럼 | 법정동코드, 법정동명, 폐지여부, 삭제일자, 과거법정동코드 |
| 총 row | 약 47,000~50,000 (폐지 포함), 현존 ~20,500 |
| 갱신 | 연 1회 (공공데이터포털), 실시간 (code.go.kr) |

### 6.3 카카오 로컬 API (지오코딩)

- 엔드포인트: `https://dapi.kakao.com/v2/local/search/address.json`
- 인증: `Authorization: KakaoAK {REST_API_KEY}`
- 무료 한도: 일 30만 호출 (개인 개발자)
- 응답: `{ documents: [{ x: lng, y: lat, ... }] }`

---

## 7. ETL 파이프라인

### 7.1 GitHub Actions 워크플로 4개

| 파일 | 트리거 | 목적 |
|------|--------|------|
| `seed-regions.yml` | 수동 + 매년 4월 | 법정동코드 시드 |
| `backfill-transactions.yml` | 수동 (1회) | 1년치 백필 (4일 소요) |
| `ingest-transactions-daily.yml` | cron `0 18 * * *` (03:00 KST) | 일일 ETL |
| `pg-dump-backup.yml` | cron 매주 일요일 | DB 백업 |

### 7.2 스크립트 구조

```
scripts/ingest/
├── types.ts                 # NormalizedTransaction 등 공통 타입
├── http.ts                  # apis.data.go.kr 클라이언트 + 재시도 + 페이징
├── xml-parse.ts             # fast-xml-parser wrapper
├── geocoder.ts              # 카카오 로컬 API + 캐시
├── property-matcher.ts      # 3단계 매칭 로직
├── aggregator.ts            # Property 집계 컬럼 SQL 업데이트
├── revalidator.ts           # /api/revalidate POST
├── notify.ts                # Discord webhook
├── regions/
│   └── seed.ts              # 법정동코드 적재
└── transactions/
    ├── runner.ts            # 공통 실행 진입점 (CLI)
    ├── adapter-apt-trade.ts
    ├── adapter-apt-rent.ts
    ├── adapter-offi-trade.ts
    ├── adapter-offi-rent.ts
    ├── adapter-rh-trade.ts
    └── adapter-rh-rent.ts
```

### 7.3 Runner 처리 흐름 (per call)

```
runner.ts({ apiType, sigunguCode, yyyymm, mode })
   1. IngestionRun 생성 (status=RUNNING, targetKey="11650-202604")
   2. apis.data.go.kr 호출
      - numOfRows=1000, pageNo 루프
      - totalCount 기반 자동 페이징
      - HTTP timeout 15s
      - 3회 exp backoff 재시도 (1s/3s/9s)
      - 429/5xx 시 IngestionRun에 errorMessage 기록 후 다음 시군구로
   3. adapter.parseRows(xml) → NormalizedRow[]
      - dealAmount "12,500" → 12500 (int)
      - dealYear/Month/Day → contractDate(Date)
      - apiType별 필드 매핑
   4. for each row:
      a) rawHash = sha256(정규화된 키 필드들)
      b) property = propertyMatcher.findOrCreate(row)
         ├ 1차: (propertyType, name, sigunguCode) 정확 일치
         ├ 2차: (propertyType, nameNorm, sigunguCode, 도로명 contains) 유사
         └ 신규: 카카오 지오코딩 → Property 생성 (location 채움)
      c) prisma.transaction.upsert by rawHash
   5. IngestionRun.update (status=OK, rowsUpserted=N)
   6. (daily 모드만) 영향받은 propertyId 수집
   7. (배치 종료 후) aggregator.updatePropertyAggregates([...affectedIds])
   8. (daily 모드만) revalidator.flush([...affectedIds])
```

### 7.4 호출량 예측

| 작업 | 총 호출 | API별 호출 | 소요 |
|------|--------|-----------|------|
| 일일 ETL | ~3,200 | API별 ~530/일 | 매트릭스 병렬, ~30분 |
| 1년 백필 | ~19,500 | API별 ~3,250 | 4일 (개발키 1,000/일 한도 분산) |

### 7.5 에러 처리 매트릭스

| 상황 | 처리 |
|------|------|
| API 429 / 5xx | exp backoff 3회 → 실패 시 IngestionRun에 errorMessage, 다음 시군구 진행 |
| XML 파싱 실패 | 해당 row만 스킵 + logger.warn |
| Property 매칭 ambiguous | 거래 많은 단지 선택 + warn 로그 |
| 카카오 지오코딩 실패 | Property 생성하되 location=null. 주 1회 `reconcile-properties.ts`가 재시도 |
| Transaction rawHash 충돌 | upsert로 자동 스킵 (의도된 동작) |
| Free tier 용량 80% | `pg_database_size()` 모니터링 → Discord 알림 → Pro 전환 결정 |

---

## 8. 페이지 & 라우팅

### 8.1 URL 매핑

| 라우트 | 모드 | revalidate | sitemap | 비고 |
|--------|------|-----------|---------|------|
| `/` | ISR | 1h | ✅ | 메인 |
| `/apt` | ISR | 1h | ✅ | 아파트 hub |
| `/officetel` | ISR | 1h | ✅ | 오피스텔 hub |
| `/villa` | ISR | 1h | ✅ | 연립·다세대 hub (메뉴 표시명은 "다세대") |
| `/apt/[id]` | ISR + On-Demand | 6h | ✅ | 아파트 상세 |
| `/officetel/[id]` | ISR + On-Demand | 6h | ✅ | 오피스텔 상세 |
| `/villa/[id]` | ISR + On-Demand | 6h | ✅ | 연립·다세대 상세 |
| `/region` | ISR | 24h | ✅ | 시도 17개 허브 |
| `/region/[code]` | ISR | 6h | ✅ | 시군구 페이지 |
| `/list` | SSR + edge 60s | — | ❌ noindex | 필터 도구 |
| `/search` | SSR + edge 60s | — | ❌ noindex | 검색 결과 |
| `/sitemap.xml` | 정적 | 24h | — | |
| `/api/search` | 동적 | — | — | 자동완성 |
| `/api/revalidate` | 동적 POST | — | — | 토큰 검증 |
| `/api/subscribe-soon` | 동적 POST | — | — | 이메일 알림 신청 |
| `/api/health` | 동적 | — | — | 헬스체크 |
| `/admin/ingestion` | SSR + Basic Auth | — | ❌ | ETL 운영 대시 |

### 8.2 의도적으로 만들지 않는 페이지

- `/transaction/[id]` — 거래 단건 상세 (콘텐츠 빈약, 단지 페이지에 표·차트로 통합)
- `/region/[code]/[dongCode]` — 동 단위 (URL 폭발 회피, 쿼리 파라미터로 대체)
- `/sale/[type]`, `/rent/[type]` — 거래유형 hub (`/list?type=...&deal=...`로 대체)

### 8.3 단지 상세 페이지 컴포넌트 트리

```
<PropertyDetailPage>
  <PropertyHeader>            단지명·주소·준공·세대수
  <StatsCards>                매매가 / 전세가 / 월세 / 거래량 4카드
  <PriceCharts>               매매·전세·월세 미니차트 3개 (Recharts)
  
  <TransactionSection dealType="SALE">   매매 거래 내역
    <AreaFilterChip>          [전체] [25평] [34평] ...
    <TransactionRows>         10건/페이지
    <Pagination>              ‹‹ ‹ 1 2 3 4 … N › ››
  </TransactionSection>
  
  <TransactionSection dealType="JEONSE"> 전세 거래 내역 (구조 동일)
  <TransactionSection dealType="WOLSE">  월세 거래 내역 (구조 동일)
  
  <StaticMap>                 카카오 SDK 정적 지도
  <NearbyProperties>          PostGIS 2km 인근 단지 10개
  
  <Phase2Placeholder text="주변 학교·마트·병원" />
  <Phase2Placeholder text="주변 청약 정보" />
  
  <RelatedRegionLinks>        시군구·인근 시군구 내부 링크
</PropertyDetailPage>
```

### 8.4 URL slug 정책

- 단순화: `/apt/[id]` (slug 없음)
- 단지명 slug는 URL에 포함하지 않음 (단지명 변경 시 URL 변경 회피)
- canonical: 자기 자신
- 검색 파라미터 변형(예: `?deal=jeonse`)은 client-only 상태로 처리, URL 변경 없음

### 8.5 메타데이터 전략

```typescript
// app/apt/[id]/page.tsx
export async function generateMetadata({ params }) {
  const apt = await getPropertyById(parseId(params.id));
  if (!apt) return {};
  
  return {
    title: `${apt.name} 실거래가 · ${apt.region.fullName} | 임장온`,
    description: `${apt.name}(${apt.builtYear}년 준공, ${apt.households}세대) 매매 평균 ${formatBillion(apt.saleAvgPrice12m)}. 매매 ${apt.saleCount12m}건·전세 ${apt.jeonseCount12m}건·월세 ${apt.wolseCount12m}건 한눈에.`,
    alternates: { canonical: `/apt/${apt.id}` },
    openGraph: {
      title: `${apt.name} 실거래가`,
      description: `${apt.region.fullName} · ${apt.builtYear}년 준공`,
      images: [`/apt/${apt.id}/opengraph-image`],
    },
  };
}
```

### 8.6 sitemap & robots

```typescript
// app/sitemap.ts — 자동 분할 (5만 초과 시)
export default async function sitemap() {
  return [
    { url: '/', changeFrequency: 'daily', priority: 1.0 },
    { url: '/apt', changeFrequency: 'daily', priority: 0.9 },
    { url: '/officetel', changeFrequency: 'daily', priority: 0.9 },
    { url: '/villa', changeFrequency: 'daily', priority: 0.9 },
    { url: '/region', changeFrequency: 'weekly', priority: 0.8 },
    ...sigunguEntries(),
    ...propertyEntries(),
  ];
}

// app/robots.ts
export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'], disallow: ['/search', '/list', '/api/', '/admin'] },
      { userAgent: 'Yeti', allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'], disallow: ['/search', '/list', '/api/', '/admin'] },
    ],
    sitemap: 'https://imjang-on.com/sitemap.xml',
  };
}
```

---

## 9. 네비게이션 & UI

### 9.1 네비게이션 구조

**데스크탑 (≥1024px)**:
```
[🏠 임장온]  홈  부동산 ▾  지역 ▾  청약 [Soon]  생활권 [Soon]   🔍 검색
                  │              │
                  ▼              ▼ (시도 17개)
              ┌──────────┐
              │ 아파트     │ → /apt
              │ 오피스텔   │ → /officetel
              │ 다세대     │ → /villa   (연립·다세대 통칭 short label)
              └──────────┘

용어 정리:
- 메뉴·UI 표시명: "다세대" (콜로퀴얼)
- 데이터 분류 (PropertyType enum): ROW_HOUSE | MULTIPLEX (국토부 응답 houseType 필드와 1:1)
- URL: `/villa` (둘 다 통합)
- 정식 표기 필요 시: "연립·다세대"
```

**모바일 하단 탭바**:
```
🏠 홈  |  🏢 부동산  |  📍 지역  |  🔍 검색  |  ☰ 더보기
```

**Phase 2 메뉴**: "Soon" 배지 + 클릭 시 안내 모달 + 이메일 알림 신청 (EmailSignup 테이블에 저장).

### 9.2 단위 표기 규약

- **데이터 저장**: 전용면적은 모두 **㎡** (`Decimal(6,2)`)
- **화면 표시**: 사용자 선호에 따라 ㎡/평 토글. 변환은 표시 시점에 `formatArea` 헬퍼로 처리 (1평 = 3.305785㎡)
- **가격 단위**: DB는 정수형 만원. 화면은 `formatBillion`이 자동으로 "30.2억", "1,250만원" 등 변환

### 9.3 디자인 토큰 (HTML 시안 이식)

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-bg:        #f7fbff;
  --color-card:      #ffffff;
  --color-text:      #172033;
  --color-muted:     #64748b;
  --color-line:      #dbeafe;
  --color-blue:      #2563eb;
  --color-blue-dark: #1e3a8a;
  --color-sky:       #38bdf8;
  --color-sky-soft:  #e0f2fe;
  --color-soft:      #f1f7ff;
  --color-green:     #0f9f6e;
  --color-red:       #ef4444;

  --radius-card:     22px;
  --shadow-soft:     0 14px 34px rgba(37, 99, 235, 0.10);

  --font-sans:       "Pretendard", -apple-system, "Noto Sans KR", sans-serif;
}
```

### 9.3 단지 카드 (list 페이지) 디자인

```
┌──────────────────────────────────────────────────────────────────┐
│ 🏢  래미안서초에스티지                    서울 서초구 반포동          │
│     2009년 준공 · 1,184세대 · 전용 59~115㎡                        │
│ ──────────────────────────────────────────────────────────────  │
│ 매매  평균 28.5억 (24건)   최근 30.2억 (2026-04-12) ▲6%            │
│ 전세  평균 14.2억 (52건)   최근 15.0억 (2026-05-08) ▲2%            │
│ 월세  보 3억 / 월 120만원 (12건)  최근 (2026-05-01)                 │
│ ──────────────────────────────────────────────────────────────  │
│ 최근 1년 88건  ·  [상세 보기 →]                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. 검색·필터·주변검색

### 10.1 자동완성 — `/api/search?q=래미안`

응답: `{ properties: [...], regions: [...] }`, 각 최대 10건.

```sql
-- 단지
SELECT p.id, p.name, p.address, r."fullName"
FROM "Property" p
JOIN "Region" r ON r.code = p."regionCode"
WHERE p."nameNorm" % $1 OR p."nameNorm" ILIKE $1 || '%'
ORDER BY (p."nameNorm" ILIKE $1 || '%')::int DESC,
         similarity(p."nameNorm", $1) DESC,
         p."txCount12m" DESC
LIMIT 10;
```

응답 헤더: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`.

### 10.2 list 필터 페이지 — 단지 기준

핵심 쿼리는 Property 기반 (집계 컬럼 활용):
```sql
SELECT p.id, p.name, p.address, p."builtYear", p."households",
       p."saleAvgPrice12m", p."saleLastPrice", p."saleLastAt", p."saleCount12m",
       p."jeonseAvgDeposit12m", ..., r."fullName"
FROM "Property" p
JOIN "Region" r ON r.code = p."regionCode"
WHERE p."propertyType" = $type
  AND ($sigungu IS NULL OR p."sigunguCode" = $sigungu)
  AND p."txCount12m" > 0
  AND ($priceMin IS NULL OR p."saleAvgPrice12m" >= $priceMin)
ORDER BY p."lastTxAt" DESC
LIMIT 30 OFFSET $offset;
```

### 10.3 단지 상세 거래 표 — 섹션별 페이징

```sql
-- 각 섹션 (10건/페이지)
SELECT * FROM "Transaction"
WHERE "propertyId" = $1 AND "dealType" = $2
  AND ($area IS NULL OR ABS("exclusiveArea" - $area) < 3)
ORDER BY "contractDate" DESC, id DESC
LIMIT 10 OFFSET ($page - 1) * 10;

-- 총 건수 (3개 한 번에)
SELECT "dealType", COUNT(*)::int FROM "Transaction"
WHERE "propertyId" = $1
GROUP BY "dealType";
```

페이지 2 이상은 Server Action(`actions.ts`) → URL 변경 없음.

### 10.4 인근 단지 — PostGIS

```sql
SELECT p.id, p.name, p.address, r."fullName",
       ST_Distance(p.location, $center::geography) / 1000.0 AS dist_km,
       p."txCount12m"
FROM "Property" p
JOIN "Region" r ON r.code = p."regionCode"
WHERE p."propertyType" = $type
  AND p.id != $excludeId
  AND ST_DWithin(p.location, $center::geography, 2000)
  AND p."txCount12m" > 0
ORDER BY dist_km ASC, p."txCount12m" DESC
LIMIT 10;
```

GiST 인덱스(`prop_location_gix`)로 ms 단위 응답.

### 10.5 페이지네이션 전략

| 페이지 | 방식 | 이유 |
|--------|------|------|
| `/list` 필터 결과 | Cursor `(contractDate, id)` | 깊은 페이지 일정 성능 |
| `/search` 결과 | Offset (max page 20) | 사용자 깊이 들어가지 않음 |
| 단지 상세 섹션 | Offset (10건/페이지, max 10페이지) | Server Action 단순 |

### 10.6 성능 목표

| 쿼리 | p50 | p95 |
|------|-----|-----|
| 자동완성 | 30ms | 80ms |
| 검색 결과 | 80ms | 200ms |
| list 필터 | 100ms | 250ms |
| 단지 상세 cold | 200ms | 500ms |
| 단지 상세 warm | 5ms | 20ms |
| 인근 단지 | 20ms | 60ms |

---

## 11. 디렉터리 구조

```
imjang-on/
├── .github/workflows/
│   ├── ci.yml
│   ├── seed-regions.yml
│   ├── backfill-transactions.yml
│   ├── ingest-transactions-daily.yml
│   └── pg-dump-backup.yml
│
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── (public)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── _components/{nav,footer,search-input,soon-modal,property-card,region-card}.tsx
│   │   ├── apt/
│   │   │   ├── page.tsx
│   │   │   └── [id]/{page,actions,opengraph-image,loading}.tsx
│   │   ├── officetel/{page.tsx, [id]/page.tsx}
│   │   ├── villa/{page.tsx, [id]/page.tsx}
│   │   ├── region/{page.tsx, [code]/page.tsx}
│   │   ├── list/page.tsx
│   │   ├── search/page.tsx
│   │   ├── about/page.tsx
│   │   ├── data-source/page.tsx
│   │   ├── terms/page.tsx
│   │   └── privacy/page.tsx
│   ├── api/
│   │   ├── search/route.ts
│   │   ├── revalidate/route.ts
│   │   ├── subscribe-soon/route.ts
│   │   └── health/route.ts
│   ├── admin/ingestion/page.tsx
│   ├── sitemap.ts
│   ├── robots.ts
│   ├── manifest.ts
│   └── not-found.tsx
│
├── components/ui/{button,chip,card,badge,dropdown,bottom-sheet,modal,input,skeleton,tabbar,pagination}.tsx
│
├── lib/
│   ├── db.ts                # Prisma singleton
│   ├── env.ts                # zod validate
│   ├── logger.ts             # pino
│   ├── format.ts             # formatBillion, formatArea, formatDate
│   ├── slug.ts
│   ├── property.ts           # getPropertyById, getPropertiesByRegion, ...
│   ├── transaction.ts        # getTransactionsByType, getMonthlyChart
│   ├── region.ts
│   ├── search.ts             # autocomplete, searchProperties
│   ├── nearby.ts             # PostGIS raw query
│   ├── revalidate.ts
│   ├── api-error.ts          # JSON 에러 변환
│   └── analytics.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       ├── 0001_init/migration.sql
│       ├── 0002_postgis/migration.sql
│       └── 0003_pg_trgm/migration.sql
│
├── scripts/
│   ├── ingest/
│   │   ├── types.ts
│   │   ├── http.ts
│   │   ├── xml-parse.ts
│   │   ├── geocoder.ts
│   │   ├── property-matcher.ts
│   │   ├── aggregator.ts
│   │   ├── revalidator.ts
│   │   ├── notify.ts
│   │   ├── regions/seed.ts
│   │   └── transactions/{runner,adapter-apt-trade,adapter-apt-rent,adapter-offi-trade,adapter-offi-rent,adapter-rh-trade,adapter-rh-rent}.ts
│   ├── db/pg-dump.sh
│   └── ops/reconcile-properties.ts
│
├── tests/
│   ├── ingest/{adapter-apt-trade,adapter-apt-rent,property-matcher,http,xml-parse}.test.ts
│   ├── ingest/fixtures/{apt-trade-sample,apt-rent-sample,...}.xml
│   ├── lib/{format,slug}.test.ts
│   ├── integration/{property-queries,nearby,autocomplete}.test.ts
│   ├── _helpers/{db,seed}.ts
│   └── e2e/{apt-detail,search,region,list,soon-modal}.spec.ts
│
├── public/{favicon.ico, apple-touch-icon.png, og-default.png}
├── docs/superpowers/specs/2026-05-18-imjang-on-design.md
├── .env.example
├── .gitignore
├── .nvmrc
├── README.md
├── CLAUDE.md
├── next.config.mjs
├── tsconfig.json
├── postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── package.json
└── pnpm-lock.yaml
```

### 컨벤션

| 영역 | 규칙 |
|------|------|
| App Router | Server Component 기본, `'use client'`는 인터랙션만 |
| 컴포넌트 위치 | 라우트 전용 → `<route>/_components/`, 공용 → `/components/ui/` |
| 데이터 페치 | Server Component → `lib/*` 헬퍼 |
| 클라이언트 페치 | Server Action 우선. API Route는 외부 호출용·자동완성용만 |
| 파일명 | kebab-case |
| Import | `@/` 절대 경로 |
| 환경변수 | `lib/env.ts` zod validate, 직접 `process.env` 금지 |
| Prisma | 싱글톤 `lib/db.ts`만 사용 |
| PostGIS | `lib/nearby.ts`의 `prisma.$queryRaw` 헬퍼 |
| ETL | adapter는 얇게, runner가 공통 로직 |

---

## 12. 에러 처리·관측·로깅

### 12.1 관측 스택 (모두 무료)

- **Sentry** (free 5K/월) — 앱 런타임 에러
- **Vercel Logs** — 앱 로그 1시간 보존
- **Vercel Analytics + Speed Insights** — 트래픽·Core Web Vitals
- **Google Analytics 4** — 이벤트 (AdSense 필수)
- **Google Search Console + 네이버 Search Advisor** — SEO
- **UptimeRobot** (free 50) — `/api/health` 5분 ping
- **Discord webhook** — ETL 알림
- **pino** 구조화 JSON 로깅

### 12.2 에러 처리 레이어

| 위치 | 패턴 |
|------|------|
| Server Component | `notFound()` 또는 throw → `error.tsx` 자동 캐치 + Sentry |
| API Route | `lib/api-error.ts`로 `{ error: { code, message } }` JSON 변환 |
| ETL 스크립트 | 시군구별 try/catch + `IngestionRun.errorMessage` 기록 |
| Property 매칭 ambiguous | logger.warn + 거래 많은 단지 선택 |
| 지오코딩 실패 | location=null + 주 1회 reconcile |

### 12.3 Discord 알림 조건

| 조건 | 레벨 |
|------|------|
| 전체 ETL OK + rowsUpserted 요약 | info (일 1회) |
| 실패 시군구 ≥ 5개 | warn |
| 6 API 중 1개 이상 전부 실패 | error |
| 매칭 ambiguous 비율 > 5% | warn |
| 백필 단계 완료 | info |

### 12.4 헬스체크

`GET /api/health`:
```typescript
const checks = await Promise.allSettled([
  prisma.$queryRaw`SELECT 1`,
  prisma.region.count(),
  prisma.ingestionRun.findFirst({
    where: { status: 'OK', finishedAt: { gte: yesterday() } },
  }),
]);
return Response.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
```

### 12.5 Admin 페이지

`/admin/ingestion` (Basic Auth) — IngestionRun 50건 테이블 + 실패 상세 조회.

---

## 13. 테스트 전략

### 13.1 피라미드

- **단위 ~50개** (Vitest): ETL adapter, property-matcher, lib 헬퍼
- **통합 ~15개** (Vitest + Postgres+PostGIS Docker): query 헬퍼, nearby, autocomplete
- **E2E 5개** (Playwright): 검색→상세, 거래 페이징, 시군구, 필터, Soon 모달
- **시각 회귀·로드 테스트는 Phase 1에서 제외**

### 13.2 ETL 어댑터 테스트

```typescript
// tests/ingest/adapter-apt-trade.test.ts
it('parses sample XML into normalized rows', () => {
  const xml = readFileSync('./tests/ingest/fixtures/apt-trade-sample.xml', 'utf8');
  const rows = adapterAptTrade.parseRows(xml);
  expect(rows[0]).toMatchObject({
    propertyType: 'APARTMENT',
    dealType: 'SALE',
    dealAmount: expect.any(Number),
  });
});
```

### 13.3 통합 테스트 DB

GitHub Actions service:
```yaml
postgres:
  image: postgis/postgis:16-3.4
  env: { POSTGRES_PASSWORD: test, POSTGRES_DB: imjang_test }
  ports: ['5432:5432']
```

로컬은 docker-compose 또는 OrbStack.

### 13.4 E2E 5개

1. 검색 자동완성 → 단지 상세 도달
2. 단지 상세 — 3섹션 + 매매 페이지 2 이동
3. 시군구 페이지 → 단지 카드 클릭
4. /list 필터 적용 → 결과 갱신
5. Soon 모달 → 이메일 신청

### 13.5 CI

- **PR**: lint + typecheck + unit + integration
- **main push**: 위 + E2E
- 커버리지 게이트 없음, 보고만

### 13.6 의도적으로 안 함

- UI 컴포넌트 단위 테스트 (E2E로 충분)
- 시각 회귀 (Chromatic)
- Load/스트레스 테스트
- 100% 커버리지

---

## 14. 비용 추정 (Phase 1)

| 항목 | 비용 | 비고 |
|------|------|------|
| Vercel Hobby | $0 | Pro 필요 시 $20/월 |
| Supabase Free → Pro | $0 → $25 | 용량 임계점 도달 시 전환 |
| GitHub Actions Public repo | $0 | Private 시 2,000분/월 무료 |
| 공공데이터 인증키 | $0 | 즉시 발급 |
| 카카오 로컬 API (개인) | $0 | 일 30만 무료 |
| 카카오 지도 SDK | $0 | 도메인 등록 무료 트래픽 |
| Sentry | $0 | 5K errors/월 |
| GA4 / Search Console | $0 | |
| UptimeRobot | $0 | 50 monitors |
| Discord | $0 | webhook |
| **합계 (첫 6개월)** | **$0** | |
| **Pro 전환 후** | **~$25/월** | Supabase Pro |

---

## 15. 출시 체크리스트

### 15.1 출시 전 (코드 외)

- [ ] 도메인 등록 (`imjang-on.com` 등)
- [ ] 공공데이터포털 회원가입 + 6개 API 활용신청
- [ ] 카카오 개발자 등록 + REST 키·JavaScript 키 발급 + 도메인 등록
- [ ] Supabase 프로젝트 생성 + PostGIS·pg_trgm 활성화
- [ ] Vercel 프로젝트 생성 + Supabase 통합
- [ ] Sentry / GA4 / Search Console 프로젝트 생성
- [ ] Discord 서버 + webhook URL
- [ ] UptimeRobot 계정

### 15.2 출시 직전 (코드 완료 후)

- [ ] 백필 4일 완료 후 IngestionRun OK 비율 > 99%
- [ ] 단지 5개 샘플 sitemap 색인 요청 (Search Console + Naver)
- [ ] `/api/health` 200 OK 확인 + UptimeRobot 등록
- [ ] GA4 실시간 이벤트 수신 확인
- [ ] Sentry 테스트 에러 1건 → 대시보드 확인
- [ ] Lighthouse — LCP < 2.5s, CLS < 0.1, INP < 200ms (모바일)
- [ ] 단지 상세 5개 샘플 — Web Vitals + 거래 표 페이징 동작
- [ ] `/sitemap.xml` 응답 200 + URL 5만+ 포함
- [ ] `robots.txt`에 `/list`, `/search`, `/admin` disallow 확인
- [ ] AdSense 신청 (10~14일 심사)
- [ ] 푸터에 데이터 출처 + 면책 문구
- [ ] 이용약관·개인정보처리방침 페이지

---

## 16. Phase 2 로드맵 (참고)

| 단계 | 기능 | 데이터 소스 |
|------|------|-----------|
| 2.1 | 청약 데이터 + 상호 연결 | data.go.kr 15098547 |
| 2.2 | POI 7종 (학교/마트/병원/약국/공원/시장/주차장/충전소) | 표 6.4 참조 |
| 2.3 | 5년치 데이터 확장 | 동일 6 API |
| 2.4 | 전세대출·보증상품 추천 | 추후 조사 |
| 2.5 | 지도 기반 통합 탐색 | 카카오/네이버 지도 |
| 2.6 | 회원 가입 + 즐겨찾기 + 알림 | NextAuth or Supabase Auth |
| 2.7 | 단독다가구·토지 추가 | data.go.kr SH/Land API |

---

## 17. 결정 히스토리 (왜 이렇게 골랐는가)

| 결정 | 대안 | 이유 |
|------|------|------|
| Postgres + PostGIS (MySQL 폐기) | MySQL + Haversine | 600만 거래 좌표 검색 성능 압도적 |
| Supabase (Cafe24 VPS 폐기) | Cafe24 자체호스팅 | 출시 속도·운영 부담 최소화. Postgres dump로 추후 이전 가능 |
| 1년치 (5년치 폐기) | 5년 백필 | 사이드 프로젝트 빠른 검증. 백필 4일로 단축 |
| 청약·POI 제외 | Phase 1 포함 | 스코프 최소화. 실거래가 단독 검증 |
| ISR (SSR 무조건 폐기) | 전체 SSR | SEO·애드센스 동일 만족 + 비용·속도 우위 |
| Tailwind v4 (vanilla CSS 폐기) | CSS 변수만 사용 | AI 보조 개발 호환성, Next.js 생태계 표준 |
| 부동산 nav 드롭다운 | 평면 5개 메뉴 | UX 명료 + 메뉴바 깔끔 |
| 거래 표 3섹션 분리 | 통합 표 + 필터 칩 | 사용자 의도 ("거래 내역 한눈에"). 호갱노노 패턴 |
| Property에 집계 컬럼 denormalize | 매번 GROUP BY | list 페이지 응답 200ms 목표 |
| 단지 영구 ID 부재 → rawHash unique | 자체 ID 부여 | 공공API에 ID가 없어 정규화 해시로 중복 방지 |
| 개발키만 사용 (운영키 신청 폐기) | 운영계정 신청 | Phase 1 호출량(~3,200/일)이 한도 안. 행정 시간 단축 |
| 카카오 지오코딩 (도로명주소DB 폐기) | 도로명주소 위치정보DB 신청 | DB는 서면 신청 1~2주 소요. 카카오는 즉시 + 무료 한도 충분 |

---

## 18. 다음 단계

1. **사용자 spec 리뷰** (이 문서) — 변경 요청 수렴
2. **writing-plans** 스킬로 구현 계획서 작성 — 작업 단위·순서·의존성·검증 기준 분해
3. **구현 시작** — Phase 1A: 인프라(Vercel·Supabase·키 발급)
4. **구현 진행** — Phase 1B: ETL → Phase 1C: 페이지·UI → Phase 1D: 테스트·관측·출시
