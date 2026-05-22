# 주변 인프라 데이터 수집 설계

**날짜**: 2026-05-22  
**범위**: EV충전소 · 전통시장 · 소상공인 상가 수집 및 매물 상세 페이지 연동

---

## 목표

실거래가 데이터와 함께 매물 주변 편의시설 정보를 제공한다.

- 매물 상세 페이지: 반경 내 시설 목록 + 거리 표시
- 향후 전용 메뉴(충전소, 시장 등): 타입별 필드로 필터링 가능

---

## 스키마

분리 테이블 방식. 각 테이블은 독립 Prisma 모델로 관리한다.  
CTI(Class Table Inheritance)는 Prisma 미지원으로 제외.

```prisma
model EvCharger {
  id           BigInt                                @id @default(autoincrement())
  sourceId     String                                @unique @db.VarChar(80)
  name         String                                @db.VarChar(100)
  address      String                                @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?
  chargeSpeed  String                                @db.VarChar(10)  // "급속" | "완속"
  chargerCount Int
  operatorName String?                               @db.VarChar(80)
  updatedAt    DateTime                              @updatedAt

  @@index([chargeSpeed])
}

model TraditionalMarket {
  id         BigInt                                @id @default(autoincrement())
  sourceId   String                                @unique @db.VarChar(80)
  name       String                                @db.VarChar(100)
  address    String                                @db.VarChar(200)
  location   Unsupported("geography(Point,4326)")?
  marketType String?                               @db.VarChar(40)
  updatedAt  DateTime                              @updatedAt
}

model Store {
  id           BigInt                                @id @default(autoincrement())
  sourceId     String                                @unique @db.VarChar(80)
  name         String                                @db.VarChar(100)
  address      String                                @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?
  industryCode String?                               @db.VarChar(20)
  industryName String?                               @db.VarChar(60)
  sigunguCode  String                                @db.VarChar(5)
  updatedAt    DateTime                              @updatedAt

  @@index([sigunguCode])
  @@index([industryCode])
}
```

각 테이블 `location` 컬럼에 PostGIS GIST 인덱스를 마이그레이션에서 수동 추가한다.

---

## GitHub Actions

파일: `.github/workflows/ingest-amenities.yml`

- **스케줄**: 매월 1일 02:00 UTC (월 1회)
- **수동 실행**: `workflow_dispatch` — source 파라미터로 특정 데이터소스만 실행 가능
- **매트릭스**: `[ev-charger, traditional-market, store]` 병렬 실행
- **환경변수**: `DATABASE_URL`, `DIRECT_URL`, `PUBLIC_DATA_KEY`, `DISCORD_WEBHOOK_URL`

```yaml
name: ingest-amenities
on:
  schedule:
    - cron: '0 2 1 * *'
  workflow_dispatch:
    inputs:
      source:
        description: 'ev-charger | traditional-market | store | all'
        default: 'all'
jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        source: [ev-charger, traditional-market, store]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/amenities/runner.ts --source=${{ matrix.source }}
        timeout-minutes: 60
```

---

## 스크립트 구조

```
scripts/ingest/amenities/
├── runner.ts                     # 진입점, IngestionRun 기록, 에러 처리
├── adapter-ev-charger.ts         # 한국환경공단 API
├── adapter-traditional-market.ts # 전국전통시장표준데이터
└── adapter-store.ts              # 소상공인시장진흥공단 상가정보 API
```

### runner.ts 동작

1. `--source` 파라미터로 실행할 어댑터 선택
2. `IngestionRun` 생성 (RUNNING)
3. 어댑터 실행 → upsert (`sourceId` 기준)
4. `IngestionRun` 완료 기록 (OK / ERROR)
5. Discord 알림

기존 트랜잭션 runner와 동일한 패턴. `IngestionRun.source`는 `amenity-ev-charger` 등으로 구분.

---

## 수집 범위 및 데이터소스

| 소스 | API | 범위 | 예상 건수 | 업데이트 |
|---|---|---|---|---|
| EV충전소 | 한국환경공단_전기자동차 충전소 정보 | 전국 단일 호출 | ~4만 건 | 월 1회 전체 갱신 |
| 전통시장 | 전국전통시장표준데이터 | 전국 단일 호출 | ~1,600건 | 월 1회 전체 갱신 |
| 소상공인 상가 | 소상공인시장진흥공단_상가(상권)정보 | DB 시군구 기준 | ~300만 건 | 월 1회 시군구 단위 갱신 |

**소상공인 상가**: 매물이 있는 시군구 목록을 DB에서 동적으로 가져와 순회.  
매물 지역이 늘어나면 다음 월 수집 시 자동으로 포함된다.

---

## 매물 상세 페이지 조회

```ts
// 좌표 기반 병렬 공간 쿼리
const [chargers, markets, stores] = await Promise.all([
  getNearbyEvChargers(lat, lng, 500),      // 반경 500m
  getNearbyTraditionalMarkets(lat, lng, 1000), // 반경 1km
  getNearbyStores(lat, lng, 300),          // 반경 300m
])
```

각 함수는 PostGIS `ST_DWithin`으로 쿼리, 결과에 거리(`ST_Distance`) 포함.  
반경은 타입별로 다르게 적용 (추후 조정 가능).

---

## 구현 순서

1. **EV충전소** — 데이터 단순, 전국 단일 호출. 스크립트 패턴 및 마이그레이션 검증용.
2. **전통시장** — 볼륨 작음, 표준데이터 포맷 적용.
3. **소상공인 상가** — 볼륨 가장 큼, 시군구 루프 + 페이지네이션 처리.

---

## 향후 확장

학교, 의료기관 등 추가 시: 새 Prisma 모델 + 어댑터 파일 추가.  
기존 테이블·runner 코드 변경 없음.
