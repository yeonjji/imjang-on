# 학교·공원 데이터 수집 설계

**날짜**: 2026-05-23  
**범위**: 전국초중등학교위치표준데이터 · 전국도시공원정보표준데이터 수집 (수집만, 상세 페이지 연동 제외)

---

## 목표

학교·공원 편의시설 데이터를 공공데이터포털 XML API에서 수집해 DB에 적재한다.  
기존 amenity ingest 패턴(EV충전소·전통시장·소상공인 상가)을 그대로 따른다.

---

## 스키마

```prisma
model School {
  id           BigInt                                @id @default(autoincrement())
  sourceId     String                                @unique @db.VarChar(80)
  name         String                                @db.VarChar(100)
  address      String                                @db.VarChar(200)
  location     Unsupported("geography(Point,4326)")?
  schoolLevel  String                                @db.VarChar(10)   // 초등학교 | 중학교 | 고등학교
  schoolType   String?                               @db.VarChar(20)   // 국립 | 공립 | 사립
  updatedAt    DateTime                              @updatedAt

  @@index([schoolLevel])
}

model Park {
  id         BigInt                                @id @default(autoincrement())
  sourceId   String                                @unique @db.VarChar(80)
  name       String                                @db.VarChar(100)
  address    String                                @db.VarChar(200)
  location   Unsupported("geography(Point,4326)")?
  parkType   String?                               @db.VarChar(40)   // 근린공원 | 어린이공원 | 체육공원 등
  area       Float?                                                  // 면적(㎡)
  updatedAt  DateTime                              @updatedAt

  @@index([parkType])
}
```

`location` 컬럼에 PostGIS GIST 인덱스를 마이그레이션에서 수동 추가한다.

---

## 스크립트 구조

```
scripts/ingest/amenities/
├── runner.ts                     # school/park 분기 추가
├── types.ts                      # NormalizedSchool, NormalizedPark, 소스키 추가
├── adapter-ev-charger.ts
├── adapter-traditional-market.ts
├── adapter-store.ts
├── adapter-school.ts             # 신규 — 전국초중등학교위치표준데이터
└── adapter-park.ts               # 신규 — 전국도시공원정보표준데이터
```

### adapter 동작

두 소스 모두 공공데이터포털 XML API. 전국 단일 호출(전통시장과 동일 패턴).

- `fetchAllSchools()` → `NormalizedSchool[]`
- `fetchAllParks()` → `NormalizedPark[]`
- 예상 건수: 학교 ~12,000건, 공원 ~25,000건
- 페이지네이션: 기존 `fetchAllPages` 재사용

### types.ts 추가

```ts
export interface NormalizedSchool {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  schoolLevel: string;   // "초등학교" | "중학교" | "고등학교"
  schoolType: string | null;
}

export interface NormalizedPark {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  parkType: string | null;
  area: number | null;
}

// AmenitySourceKey 확장
export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'school'
  | 'park';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'school': 'amenity-school',
  'park': 'amenity-park',
};
```

### runner.ts 변경 (분기 추가)

```ts
} else if (source === 'school') {
  upserted = await ingestSchools();
} else if (source === 'park') {
  upserted = await ingestParks();
}
```

upsert 패턴은 기존 `ingestTraditionalMarkets()`와 동일. `sourceId` 기준 upsert 후 `ST_MakePoint`로 location 갱신.

---

## GitHub Actions

파일: `.github/workflows/ingest-amenities.yml`

### 변경 내용

matrix 소스 목록에 `school`, `park` 추가:

```yaml
matrix:
  source: ${{ github.event_name == 'workflow_dispatch'
    && fromJson(format('["{0}"]', inputs.source))
    || fromJson('["ev-charger","traditional-market","store","school","park"]') }}
```

`workflow_dispatch` input description 업데이트:

```yaml
inputs:
  source:
    description: 'ev-charger | traditional-market | store | school | park'
    default: 'ev-charger'
```

- **스케줄**: 기존과 동일 — 매월 1일 02:00 UTC
- **fail-fast: false** 유지

---

## 수집 범위 및 데이터소스

| 소스 | API | 범위 | 예상 건수 | 업데이트 |
|---|---|---|---|---|
| 학교 | 전국초중등학교위치표준데이터 | 전국 단일 호출 | ~12,000건 | 월 1회 전체 갱신 |
| 공원 | 전국도시공원정보표준데이터 | 전국 단일 호출 | ~25,000건 | 월 1회 전체 갱신 |

---

## 향후 확장

매물 상세 페이지 연동 시 PostGIS `ST_DWithin`으로 반경 조회:
- 학교: 반경 1km
- 공원: 반경 1km
