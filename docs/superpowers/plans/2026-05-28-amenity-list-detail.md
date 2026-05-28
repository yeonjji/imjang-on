# 생활편의 · 상권·편의 4종 LIST/DETAIL 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편의점·마트·카페·전통시장 4종에 대해 `/amenity/[category]` 단일 라우트 트리로 LIST(전국 허브 → 시군구 LIST + 필터) + DETAIL(주변 아파트·주변 상권 종합·같은 카테고리 N건) 페이지를 구축하고, `life-menu.ts`에서 4종을 라이브 전환한다.

**Architecture:** Next.js App Router의 dynamic segment `[category]` 한 트리가 4종을 모두 서빙. 카테고리별 차이(Store vs TraditionalMarket, sub-filter, DETAIL 필드)는 `AmenityCategoryDef` 어댑터 인터페이스로 흡수. UI는 학교(`/school`) 페이지의 카테고리 중립 버전(`amenity-*` 컴포넌트)으로 재구현.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Prisma (PostgreSQL + PostGIS) · Tailwind + CSS vars · Vitest (단위) · Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-28-amenity-list-detail-design.md`

**Reference patterns (필수 정독):**
- `app/(public)/school/page.tsx`, `app/(public)/school/[sigunguCode]/page.tsx`, `app/(public)/school/[sigunguCode]/[id]/page.tsx`
- `app/(public)/school/_components/*`, `app/(public)/school/[sigunguCode]/[id]/_components/*`
- `lib/school.ts`, `lib/amenity.ts`(현재), `lib/region.ts`, `lib/amenity-category.ts`
- `scripts/ingest/amenities/match-sigungu.ts`, `scripts/ingest/amenities/school-region-backfill.ts`
- `html/list.html`, `html/detail.html` (디자인 source of truth — 구조·간격·카피 그대로 포팅)

**Convention notes:**
- 테스트 명령: 단위 `pnpm test:unit`, e2e `pnpm test:e2e`, 타입 `pnpm typecheck`
- 커밋 메시지: 기존 컨벤션 따라 한국어 한 줄 + 본문 한국어 (예: `feat(amenity): ...`)
- 모든 Server Component는 학교 패턴 따라 `export const revalidate = ...` 사용
- DB 작업은 `dotenv -e .env.local -- ...` 래핑 (package.json scripts 참조)
- 커밋은 한 Task 끝날 때마다 (자주, 작게)

---

## Phase 1 — `TraditionalMarket.sigunguCode` 컬럼 추가 + 백필

§4.1 전제 작업. 이후 모든 시군구 라우트가 이 컬럼에 의존.

### Task 1.1: Prisma 스키마에 `sigunguCode` 추가 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (TraditionalMarket 모델, 약 210-218라인)
- Create: `prisma/migrations/20260528010000_add_market_sigungu_code/migration.sql`

- [ ] **Step 1: 스키마 수정**

`prisma/schema.prisma`의 `TraditionalMarket` 모델을 다음으로 교체:

```prisma
model TraditionalMarket {
  id          BigInt                                @id @default(autoincrement())
  sourceId    String                                @unique @db.VarChar(80)
  name        String                                @db.VarChar(100)
  address     String                                @db.VarChar(200)
  location    Unsupported("geography(Point,4326)")?
  marketType  String?                               @db.VarChar(40)
  sigunguCode String?                               @db.VarChar(5)
  updatedAt   DateTime                              @updatedAt

  @@index([sigunguCode])
  @@index([marketType])
}
```

- [ ] **Step 2: 마이그레이션 SQL 작성**

`prisma/migrations/20260528010000_add_market_sigungu_code/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "TraditionalMarket" ADD COLUMN "sigunguCode" VARCHAR(5);

-- CreateIndex
CREATE INDEX "TraditionalMarket_sigunguCode_idx" ON "TraditionalMarket"("sigunguCode");

-- CreateIndex (marketType은 기존 schema에는 인덱스 없었음; 필터에 쓰니 추가)
CREATE INDEX "TraditionalMarket_marketType_idx" ON "TraditionalMarket"("marketType");
```

- [ ] **Step 3: 마이그레이션 적용 + Prisma client 재생성**

Run: `pnpm prisma:migrate -- --name add_market_sigungu_code` (또는 위에서 만든 디렉터리를 그대로 deploy할 거면 `pnpm prisma:deploy`)
Expected: 마이그레이션 적용 OK, `prisma generate` 자동 실행되어 `@prisma/client`에 `sigunguCode` 필드 노출.

- [ ] **Step 4: 타입 확인**

Run: `pnpm typecheck`
Expected: 에러 없음. (현재 `lib/amenity.ts`의 `getNearbyTraditionalMarkets`는 sigunguCode를 select하지 않으므로 타입 변화 없음.)

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/20260528010000_add_market_sigungu_code
git commit -m "feat(db): TraditionalMarket.sigunguCode 컬럼 추가

상권·편의 4종 LIST/DETAIL의 시군구 라우트 전제 작업.
백필은 Task 1.3."
```

---

### Task 1.2: `TraditionalMarket` 백필 스크립트 + 단위 테스트

**Files:**
- Create: `scripts/ingest/amenities/market-region-backfill.ts`
- Create: `tests/ingest/market-region-backfill.test.ts`
- Modify: `package.json` (scripts 섹션)

`scripts/ingest/amenities/school-region-backfill.ts`와 동일 패턴. `matchSigunguCode`(`scripts/ingest/amenities/match-sigungu.ts`) 그대로 재사용.

- [ ] **Step 1: 실패 테스트 작성**

`tests/ingest/market-region-backfill.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchSigunguCode, type RegionRef } from '@/scripts/ingest/amenities/match-sigungu';

// 백필 스크립트 자체는 DB I/O라 통합 테스트가 어렵다.
// 핵심 매칭 로직(matchSigunguCode)이 시장 주소 샘플들로도 잘 동작하는지 회귀 가드.
describe('matchSigunguCode — 전통시장 주소 샘플', () => {
  const regions: RegionRef[] = [
    { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
    { sido: '경기도', sigungu: '성남시 분당구', sigunguCode: '41135' },
    { sido: '경기도', sigungu: '성남시 수정구', sigunguCode: '41131' },
    { sido: '부산광역시', sigungu: '해운대구', sigunguCode: '26350' },
  ];

  it('일반적인 도로명 주소를 시군구코드로 매핑', () => {
    expect(matchSigunguCode('서울특별시 강남구 테헤란로 100', regions)).toBe('11680');
    expect(matchSigunguCode('부산광역시 해운대구 우동 123', regions)).toBe('26350');
  });

  it('성남시 하위 구는 더 긴 접두를 우선 (분당구/수정구 구분)', () => {
    expect(matchSigunguCode('경기도 성남시 분당구 야탑동 99', regions)).toBe('41135');
    expect(matchSigunguCode('경기도 성남시 수정구 단대동 88', regions)).toBe('41131');
  });

  it('주소가 매칭 안 되면 null', () => {
    expect(matchSigunguCode('충청북도 청주시 상당구 1', regions)).toBeNull();
    expect(matchSigunguCode('', regions)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 통과해야 함 (matchSigunguCode는 이미 존재)**

Run: `pnpm test:unit -- market-region-backfill`
Expected: 3 tests passing.

- [ ] **Step 3: 백필 스크립트 작성**

`scripts/ingest/amenities/market-region-backfill.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { matchSigunguCode, type RegionRef } from './match-sigungu';

const READ_BATCH = 2000;
const UPDATE_CHUNK = 1000;

async function main() {
  const regionRows = await prisma.region.findMany({
    where: { level: 2, isAbolished: false, sigunguCode: { not: null } },
    select: { sido: true, sigungu: true, sigunguCode: true },
  });
  const regions: RegionRef[] = regionRows
    .filter((r) => !!r.sigungu && !!r.sigunguCode)
    .map((r) => ({ sido: r.sido, sigungu: r.sigungu as string, sigunguCode: r.sigunguCode as string }));
  logger.info({ regions: regions.length }, 'market backfill: regions loaded');

  const byCode = new Map<string, bigint[]>();
  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];
  let cursor = 0n;

  for (;;) {
    const rows = await prisma.traditionalMarket.findMany({
      where: { id: { gt: cursor } },
      select: { id: true, address: true },
      orderBy: { id: 'asc' },
      take: READ_BATCH,
    });
    if (rows.length === 0) break;
    for (const m of rows) {
      const code = matchSigunguCode(m.address, regions);
      if (code) {
        const arr = byCode.get(code) ?? [];
        arr.push(m.id);
        byCode.set(code, arr);
        matched++;
      } else {
        unmatched++;
        if (unmatchedSamples.length < 20) unmatchedSamples.push(m.address);
      }
    }
    cursor = rows[rows.length - 1].id;
  }
  logger.info({ matched, unmatched, codes: byCode.size }, 'market backfill: matching done');

  for (const [code, ids] of byCode) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK);
      await prisma.$executeRaw`
        UPDATE "TraditionalMarket" SET "sigunguCode" = ${code}
        WHERE id IN (${Prisma.join(chunk)})
      `;
    }
  }

  logger.info({ matched, unmatched, unmatchedSamples }, 'market backfill done');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'market backfill fatal');
  process.exit(1);
});
```

- [ ] **Step 4: `package.json`에 npm script 추가**

`scripts` 객체 안 `backfill:school-region` 아래에:

```json
"backfill:market-region": "dotenv -e .env.local -- tsx scripts/ingest/amenities/market-region-backfill.ts",
```

- [ ] **Step 5: 커밋**

```bash
git add scripts/ingest/amenities/market-region-backfill.ts tests/ingest/market-region-backfill.test.ts package.json
git commit -m "feat(ingest): TraditionalMarket sigunguCode 백필 스크립트

school-region-backfill 동일 패턴. matchSigunguCode 재사용."
```

---

### Task 1.3: 백필 실행 + 미매칭 검증

**Files:** (실행만, 변경 없음)

- [ ] **Step 1: 백필 실행**

Run: `pnpm backfill:market-region`
Expected: 로그에 `matched`, `unmatched`, `codes` 카운트 출력. 보통 unmatched는 0~수십건 (외래 표기·구주소 등).

- [ ] **Step 2: 매칭 결과 확인**

PSQL이나 Prisma Studio로 확인:
- 총 row 수: `SELECT count(*) FROM "TraditionalMarket"` (≈1,393)
- sigunguCode NULL 잔여: `SELECT count(*) FROM "TraditionalMarket" WHERE "sigunguCode" IS NULL`
- 잔여가 50건 이상이면 unmatchedSamples 로그 확인 후 Task 1.2 매칭 로직 보강 (필요 시)

- [ ] **Step 3: 커밋 (실행 결과 로그 남기지 않음. 변경 파일 없으면 스킵.)**

---

## Phase 2 — `lib/amenity.ts` → `lib/amenity/nearby.ts` 이전

학교 DETAIL이 `lib/amenity.ts`에서 `getNearbyApartments` · `getSchoolNearbyAmenities`를 import. 이전 후 학교 회귀 통과 확인.

### Task 2.1: 파일 이동 + import 경로 갱신

**Files:**
- Create: `lib/amenity/nearby.ts` (`lib/amenity.ts`의 내용 그대로 이전, 한 곳만 변경)
- Delete: `lib/amenity.ts`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx` (import 경로)
- Modify: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx`
- Modify: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-apartments.tsx`

`lib/amenity.ts`는 현재 `getNearby*` 함수들 + 타입들만 가지고 있어 파일명만 바뀜.

- [ ] **Step 1: `lib/amenity/` 디렉터리 생성 + nearby.ts로 이동**

Run:
```bash
mkdir -p /Users/jiyeonjeong/project/imjang-on/lib/amenity
git mv /Users/jiyeonjeong/project/imjang-on/lib/amenity.ts /Users/jiyeonjeong/project/imjang-on/lib/amenity/nearby.ts
```

- [ ] **Step 2: import 경로 갱신**

3개 파일의 import 한 줄씩 변경:

`app/(public)/school/[sigunguCode]/[id]/page.tsx` 6라인:
```ts
import { getNearbyApartments, getSchoolNearbyAmenities } from '@/lib/amenity/nearby';
```

같은 파일 15라인:
```ts
import type { NearbyApartment } from '@/lib/amenity/nearby';
```

`app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx` 4라인:
```ts
import type { NearbyPark, NearbyStore, NearbyEvCharger } from '@/lib/amenity/nearby';
```

`app/(public)/school/[sigunguCode]/[id]/_components/nearby-apartments.tsx` 4라인:
```ts
import type { NearbyApartment } from '@/lib/amenity/nearby';
```

- [ ] **Step 3: 잔여 import 검색**

Run:
```bash
grep -rn "from '@/lib/amenity'" /Users/jiyeonjeong/project/imjang-on/app /Users/jiyeonjeong/project/imjang-on/components /Users/jiyeonjeong/project/imjang-on/lib /Users/jiyeonjeong/project/imjang-on/tests /Users/jiyeonjeong/project/imjang-on/scripts
```
Expected: 결과 없음 (모두 `@/lib/amenity/nearby`로 옮겨졌어야 함).

- [ ] **Step 4: 타입 + 단위 회귀**

Run: `pnpm typecheck && pnpm test:unit`
Expected: 모두 통과.

- [ ] **Step 5: 학교 DETAIL e2e 스모크 (선택)**

Run: `pnpm test:e2e -- --grep school` (적절히 필터). Playwright 설정상 dev 서버 자동 기동.
Expected: 학교 DETAIL 관련 테스트 통과 (회귀 없음). 환경 미준비면 스킵하고 다음 Task에서 한번에.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor(lib): amenity.ts → amenity/nearby.ts

상권·편의 4종 LIST/DETAIL 작업 전 디렉터리 구조 정리.
학교 DETAIL 3개 파일의 import 경로 갱신."
```

---

## Phase 3 — 카테고리 정의 + 4개 어댑터

### Task 3.1: `AmenityCategoryDef` 인터페이스 + 공통 타입

**Files:**
- Create: `lib/amenity/category.ts` (인터페이스만; 레지스트리는 Task 3.6)

- [ ] **Step 1: 파일 작성**

```ts
// lib/amenity/category.ts
import type { Prisma } from '@prisma/client';

export type AmenitySlug = 'convenience' | 'mart' | 'cafe' | 'market';

/**
 * 4종 카테고리가 공통으로 반환하는 row 모양.
 * Prisma 모델별 추가 필드(industryName/marketType 등)는 옵셔널.
 */
export interface AmenityItem {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  industryCode?: string | null;
  industryName?: string | null;
  marketType?: string | null;
}

export interface AmenityListFilter {
  sigunguCode?: string;
  q?: string;
  /** def별 sub-filter 슬러그 (없으면 'all') */
  sub?: string;
}

export interface AmenityListResult {
  rows: AmenityItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface AmenitySubFilterOption<S extends string = string> {
  slug: S;
  label: string;
}

export interface AmenitySubFilterDef<S extends string = string> {
  paramKey: string; // URL 쿼리 키 (보통 'sub')
  options: AmenitySubFilterOption<S>[];
  defaultSlug: S; // 보통 'all'
}

export interface AmenityCategoryDef {
  slug: AmenitySlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: AmenitySubFilterDef;
  getList(filter: AmenityListFilter, page: number): Promise<AmenityListResult>;
  getById(id: bigint): Promise<AmenityItem | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  /** 카드 보조 라벨 (예: '대형마트', '상설시장') */
  inferRowSummary(row: AmenityItem): string | null;
  /** DETAIL 기본정보 그리드 행 */
  detailFields(item: AmenityItem): Array<{ label: string; value: string }>;
  /** 시군구 picker / 허브용 카운트 (groupBy 결과) */
  getCountsBySigungu(): Promise<Map<string, number>>;
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add lib/amenity/category.ts
git commit -m "feat(amenity): AmenityCategoryDef 인터페이스 + 공통 타입"
```

---

### Task 3.2: `convenience` 어댑터 + 단위 테스트

**Files:**
- Create: `lib/amenity/adapters/convenience.ts`
- Create: `tests/lib/amenity/adapters/convenience.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity/adapters/convenience.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStoreWhere } from '@/lib/amenity/adapters/convenience';

describe('convenience adapter — buildStoreWhere', () => {
  it('시군구 없으면 prefix만', () => {
    expect(buildStoreWhere({})).toEqual({
      industryCode: { startsWith: 'G20405' },
    });
  });

  it('시군구 있으면 sigunguCode + prefix', () => {
    expect(buildStoreWhere({ sigunguCode: '11680' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
    });
  });

  it('이름 검색은 contains', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', q: 'CU' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
      name: { contains: 'CU' },
    });
  });

  it('sub 값은 무시 (convenience는 subFilters 없음)', () => {
    expect(buildStoreWhere({ sigunguCode: '11680', sub: 'whatever' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20405' },
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- convenience`
Expected: import 에러 (`Cannot find module ...convenience`)

- [ ] **Step 3: 어댑터 작성**

`lib/amenity/adapters/convenience.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';

const PER_PAGE = 30;
const PREFIX = 'G20405';

export function buildStoreWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(s: { id: bigint; name: string; address: string; sigunguCode: string; industryCode: string | null; industryName: string | null }): AmenityItem {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    sigunguCode: s.sigunguCode,
    industryCode: s.industryCode,
    industryName: s.industryName,
  };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildStoreWhere(f);
  const [rows, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true },
    }),
    prisma.store.count({ where }),
  ]);
  return {
    rows: rows.map(toItem),
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE),
  };
}

async function getById(id: bigint): Promise<AmenityItem | null> {
  const s = await prisma.store.findUnique({
    where: { id },
    select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true },
  });
  return s ? toItem(s) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Store" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where: { industryCode: { startsWith: PREFIX } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export const convenienceDef: AmenityCategoryDef = {
  slug: 'convenience',
  label: '편의점',
  emoji: '🏪',
  breadcrumbLabel: '편의점',
  getList,
  getById,
  getLatLng,
  inferRowSummary: (row) => row.industryName ?? null,
  detailFields: (item) => [
    { label: '업종', value: item.industryName ?? '편의점' },
  ],
  getCountsBySigungu,
};
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

Run: `pnpm test:unit -- convenience`
Expected: 4 tests passing.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/adapters/convenience.ts tests/lib/amenity/adapters/convenience.test.ts
git commit -m "feat(amenity): convenience 어댑터 (Store industryCode prefix G20405)"
```

---

### Task 3.3: `cafe` 어댑터 + 단위 테스트

`convenience`와 동일 구조. PREFIX만 다름 (`I21201`).

**Files:**
- Create: `lib/amenity/adapters/cafe.ts`
- Create: `tests/lib/amenity/adapters/cafe.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity/adapters/cafe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCafeWhere } from '@/lib/amenity/adapters/cafe';

describe('cafe adapter — buildCafeWhere', () => {
  it('시군구 없으면 prefix만', () => {
    expect(buildCafeWhere({})).toEqual({ industryCode: { startsWith: 'I21201' } });
  });
  it('시군구 + 검색 조합', () => {
    expect(buildCafeWhere({ sigunguCode: '11680', q: '스타벅스' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'I21201' },
      name: { contains: '스타벅스' },
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- cafe`
Expected: 모듈 없음 에러.

- [ ] **Step 3: 어댑터 작성**

`lib/amenity/adapters/cafe.ts`: `convenience.ts`를 그대로 복제하되 다음만 변경:
- `PREFIX = 'I21201'`
- 함수명·상수명: `buildStoreWhere` → `buildCafeWhere`
- export const 이름: `convenienceDef` → `cafeDef`
- slug: `'cafe'`, label: `'카페'`, emoji: `'☕'`, breadcrumbLabel: `'카페'`
- `detailFields`: `{ label: '업종', value: item.industryName ?? '카페' }`

(이하 본문 함수 전체 — 가독성을 위해 약식. 실제로는 `convenience.ts` 복제 후 위 6항목만 수정해 붙여넣을 것.)

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';

const PER_PAGE = 30;
const PREFIX = 'I21201';

export function buildCafeWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(s: { id: bigint; name: string; address: string; sigunguCode: string; industryCode: string | null; industryName: string | null }): AmenityItem {
  return { id: s.id, name: s.name, address: s.address, sigunguCode: s.sigunguCode, industryCode: s.industryCode, industryName: s.industryName };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildCafeWhere(f);
  const [rows, total] = await Promise.all([
    prisma.store.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE,
      select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true } }),
    prisma.store.count({ where }),
  ]);
  return { rows: rows.map(toItem), total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

async function getById(id: bigint): Promise<AmenityItem | null> {
  const s = await prisma.store.findUnique({ where: { id },
    select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true } });
  return s ? toItem(s) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Store" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where: { industryCode: { startsWith: PREFIX } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export const cafeDef: AmenityCategoryDef = {
  slug: 'cafe', label: '카페', emoji: '☕', breadcrumbLabel: '카페',
  getList, getById, getLatLng,
  inferRowSummary: (row) => row.industryName ?? null,
  detailFields: (item) => [{ label: '업종', value: item.industryName ?? '카페' }],
  getCountsBySigungu,
};
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

Run: `pnpm test:unit -- cafe`
Expected: 2 tests passing.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/adapters/cafe.ts tests/lib/amenity/adapters/cafe.test.ts
git commit -m "feat(amenity): cafe 어댑터 (Store industryCode prefix I21201)"
```

---

### Task 3.4: `mart` 어댑터 (sub-filter: super/hyper/all) + 단위 테스트

**Files:**
- Create: `lib/amenity/adapters/mart.ts`
- Create: `tests/lib/amenity/adapters/mart.test.ts`

sub-filter:
- `all`: G20404 + G20402 (슈퍼·대형마트 모두)
- `super`: G20404 (슈퍼마켓만)
- `hyper`: G20402 (대형마트만)

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity/adapters/mart.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMartWhere } from '@/lib/amenity/adapters/mart';

describe('mart adapter — buildMartWhere', () => {
  it('sub=all (또는 미지정) — G20404 + G20402 OR', () => {
    expect(buildMartWhere({ sigunguCode: '11680' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'all' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
  });

  it('sub=super — G20404만', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'super' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20404' },
    });
  });

  it('sub=hyper — G20402만', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'hyper' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20402' },
    });
  });

  it('잘못된 sub 값은 all로 fallback', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'unknown' })).toEqual({
      sigunguCode: '11680',
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    });
  });

  it('검색 q는 contains', () => {
    expect(buildMartWhere({ sigunguCode: '11680', sub: 'hyper', q: '이마트' })).toEqual({
      sigunguCode: '11680',
      industryCode: { startsWith: 'G20402' },
      name: { contains: '이마트' },
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- mart`
Expected: 모듈 없음.

- [ ] **Step 3: 어댑터 작성**

`lib/amenity/adapters/mart.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';

const PER_PAGE = 30;
const PREFIX_SUPER = 'G20404';
const PREFIX_HYPER = 'G20402';

type MartSub = 'all' | 'super' | 'hyper';

function normalizeSub(sub: string | undefined): MartSub {
  return sub === 'super' || sub === 'hyper' ? sub : 'all';
}

export function buildMartWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  const sub = normalizeSub(f.sub);
  if (sub === 'super') where.industryCode = { startsWith: PREFIX_SUPER };
  else if (sub === 'hyper') where.industryCode = { startsWith: PREFIX_HYPER };
  else where.OR = [
    { industryCode: { startsWith: PREFIX_SUPER } },
    { industryCode: { startsWith: PREFIX_HYPER } },
  ];
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(s: { id: bigint; name: string; address: string; sigunguCode: string; industryCode: string | null; industryName: string | null }): AmenityItem {
  return { id: s.id, name: s.name, address: s.address, sigunguCode: s.sigunguCode, industryCode: s.industryCode, industryName: s.industryName };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildMartWhere(f);
  const [rows, total] = await Promise.all([
    prisma.store.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE,
      select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true } }),
    prisma.store.count({ where }),
  ]);
  return { rows: rows.map(toItem), total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

async function getById(id: bigint): Promise<AmenityItem | null> {
  const s = await prisma.store.findUnique({ where: { id },
    select: { id: true, name: true, address: true, sigunguCode: true, industryCode: true, industryName: true } });
  return s ? toItem(s) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Store" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where: { OR: [{ industryCode: { startsWith: PREFIX_SUPER } }, { industryCode: { startsWith: PREFIX_HYPER } }] },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

function inferRowSummary(row: AmenityItem): string | null {
  const c = row.industryCode ?? '';
  if (c.startsWith(PREFIX_HYPER)) return '대형마트';
  if (c.startsWith(PREFIX_SUPER)) return '슈퍼마켓';
  return row.industryName ?? null;
}

export const martDef: AmenityCategoryDef = {
  slug: 'mart',
  label: '마트',
  emoji: '🛒',
  breadcrumbLabel: '마트',
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: 'super', label: '슈퍼마켓' },
      { slug: 'hyper', label: '대형마트' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary,
  detailFields: (item) => [
    { label: '구분', value: inferRowSummary(item) ?? '마트' },
    { label: '업종', value: item.industryName ?? '-' },
  ],
  getCountsBySigungu,
};
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

Run: `pnpm test:unit -- mart`
Expected: 5 tests passing.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/adapters/mart.ts tests/lib/amenity/adapters/mart.test.ts
git commit -m "feat(amenity): mart 어댑터 + 슈퍼/대형 sub-filter

Store G20404(슈퍼) + G20402(대형마트). sub=super|hyper|all."
```

---

### Task 3.5: `market` 어댑터 (sub-filter: permanent/periodic/all) + 단위 테스트

**Files:**
- Create: `lib/amenity/adapters/market.ts`
- Create: `tests/lib/amenity/adapters/market.test.ts`

sub-filter 분류 규칙 (어댑터 내부 상수):
- `permanent`: `marketType` 값이 `'상설시장'`을 포함 (한국식 표기 기준)
- `periodic`: `marketType` 값이 `'정기'` 또는 `'일장'` 토큰을 포함 (예: 5일장, 정기시장)
- `all`: 두 조건 OR (또는 marketType 무관)

실제 DB 값은 어댑터 작업 시 `SELECT DISTINCT marketType` 1회 실행 후 상수 조정. 본 Task는 위 가정으로 작성.

- [ ] **Step 1: 실제 marketType 값 확인 (운영 DB 또는 로컬)**

Run (psql 또는 Prisma Studio):
```sql
SELECT "marketType", count(*) FROM "TraditionalMarket" GROUP BY "marketType" ORDER BY count DESC;
```
관찰된 토큰을 Step 3의 어댑터 상수에 반영. 아래는 일반적 값 가정.

- [ ] **Step 2: 실패 테스트 작성**

`tests/lib/amenity/adapters/market.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMarketWhere, classifyMarketSub } from '@/lib/amenity/adapters/market';

describe('classifyMarketSub', () => {
  it('상설시장은 permanent', () => {
    expect(classifyMarketSub('상설시장')).toBe('permanent');
  });
  it('5일장/정기시장은 periodic', () => {
    expect(classifyMarketSub('정기시장')).toBe('periodic');
    expect(classifyMarketSub('5일장')).toBe('periodic');
  });
  it('빈/미상은 unknown', () => {
    expect(classifyMarketSub(null)).toBe('unknown');
    expect(classifyMarketSub('')).toBe('unknown');
  });
});

describe('market adapter — buildMarketWhere', () => {
  it('시군구만', () => {
    expect(buildMarketWhere({ sigunguCode: '11680' })).toEqual({ sigunguCode: '11680' });
  });
  it('sub=permanent — marketType contains 상설', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'permanent' })).toEqual({
      sigunguCode: '11680',
      marketType: { contains: '상설' },
    });
  });
  it('sub=periodic — marketType OR (정기|일장)', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'periodic' })).toEqual({
      sigunguCode: '11680',
      OR: [
        { marketType: { contains: '정기' } },
        { marketType: { contains: '일장' } },
      ],
    });
  });
  it('sub=all — marketType 조건 없음', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', sub: 'all' })).toEqual({ sigunguCode: '11680' });
  });
  it('검색 q', () => {
    expect(buildMarketWhere({ sigunguCode: '11680', q: '강남' })).toEqual({
      sigunguCode: '11680',
      name: { contains: '강남' },
    });
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- market`
Expected: 모듈 없음.

- [ ] **Step 4: 어댑터 작성**

`lib/amenity/adapters/market.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';

const PER_PAGE = 30;

type MarketSub = 'all' | 'permanent' | 'periodic' | 'unknown';

export function classifyMarketSub(marketType: string | null): MarketSub {
  const v = (marketType ?? '').trim();
  if (!v) return 'unknown';
  if (v.includes('상설')) return 'permanent';
  if (v.includes('정기') || v.includes('일장')) return 'periodic';
  return 'unknown';
}

function normalizeSub(sub: string | undefined): MarketSub {
  return sub === 'permanent' || sub === 'periodic' ? sub : 'all';
}

export function buildMarketWhere(f: AmenityListFilter): Prisma.TraditionalMarketWhereInput {
  const where: Prisma.TraditionalMarketWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  const sub = normalizeSub(f.sub);
  if (sub === 'permanent') where.marketType = { contains: '상설' };
  else if (sub === 'periodic') where.OR = [
    { marketType: { contains: '정기' } },
    { marketType: { contains: '일장' } },
  ];
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(m: { id: bigint; name: string; address: string; sigunguCode: string | null; marketType: string | null }): AmenityItem {
  return {
    id: m.id,
    name: m.name,
    address: m.address,
    sigunguCode: m.sigunguCode,
    marketType: m.marketType,
  };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildMarketWhere(f);
  // 시군구가 지정되지 않은 LIST는 sigunguCode가 있는 row만 노출 (DETAIL URL 일관성)
  if (!f.sigunguCode) where.sigunguCode = { not: null };
  const [rows, total] = await Promise.all([
    prisma.traditionalMarket.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, name: true, address: true, sigunguCode: true, marketType: true },
    }),
    prisma.traditionalMarket.count({ where }),
  ]);
  return { rows: rows.map(toItem), total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

async function getById(id: bigint): Promise<AmenityItem | null> {
  const m = await prisma.traditionalMarket.findUnique({
    where: { id },
    select: { id: true, name: true, address: true, sigunguCode: true, marketType: true },
  });
  return m ? toItem(m) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "TraditionalMarket" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.traditionalMarket.groupBy({
    by: ['sigunguCode'],
    where: { sigunguCode: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

function inferRowSummary(row: AmenityItem): string | null {
  const k = classifyMarketSub(row.marketType ?? null);
  if (k === 'permanent') return '상설시장';
  if (k === 'periodic') return '정기시장';
  return row.marketType ?? null;
}

export const marketDef: AmenityCategoryDef = {
  slug: 'market',
  label: '전통시장',
  emoji: '🏬',
  breadcrumbLabel: '전통시장',
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: 'permanent', label: '상설' },
      { slug: 'periodic', label: '정기·N일장' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary,
  detailFields: (item) => [
    { label: '시장 유형', value: item.marketType ?? '-' },
    { label: '분류', value: inferRowSummary(item) ?? '-' },
  ],
  getCountsBySigungu,
};
```

- [ ] **Step 5: 테스트 재실행 — 통과 확인**

Run: `pnpm test:unit -- market`
Expected: 8 tests passing.

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/adapters/market.ts tests/lib/amenity/adapters/market.test.ts
git commit -m "feat(amenity): market 어댑터 + 상설/정기 sub-filter

TraditionalMarket. marketType에 '상설'/'정기'/'일장' 토큰
contains로 분류."
```

---

### Task 3.6: 카테고리 레지스트리 + 디스패치 + 단위 테스트

**Files:**
- Modify: `lib/amenity/category.ts` (registry helper 추가)
- Create: `tests/lib/amenity/category.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity/category.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';

describe('getCategoryDef', () => {
  it('4종 슬러그 모두 정의 반환', () => {
    for (const slug of AMENITY_SLUGS) {
      const def = getCategoryDef(slug);
      expect(def).toBeTruthy();
      expect(def?.slug).toBe(slug);
      expect(def?.label).toBeTruthy();
    }
  });
  it('잘못된 슬러그는 null', () => {
    expect(getCategoryDef('hospital')).toBeNull();
    expect(getCategoryDef('')).toBeNull();
  });
  it('AMENITY_SLUGS는 4종', () => {
    expect(AMENITY_SLUGS).toEqual(['convenience', 'mart', 'cafe', 'market']);
  });
  it('mart, market만 subFilters 보유', () => {
    expect(getCategoryDef('convenience')?.subFilters).toBeUndefined();
    expect(getCategoryDef('cafe')?.subFilters).toBeUndefined();
    expect(getCategoryDef('mart')?.subFilters).toBeTruthy();
    expect(getCategoryDef('market')?.subFilters).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- category`
Expected: `getCategoryDef`/`AMENITY_SLUGS` undefined.

- [ ] **Step 3: `lib/amenity/category.ts` 끝에 추가**

```ts
// --- 레지스트리 (위의 인터페이스 정의 다음에 추가) ---
import { convenienceDef } from './adapters/convenience';
import { cafeDef } from './adapters/cafe';
import { martDef } from './adapters/mart';
import { marketDef } from './adapters/market';

export const AMENITY_SLUGS = ['convenience', 'mart', 'cafe', 'market'] as const satisfies readonly AmenitySlug[];

export const AMENITY_CATEGORIES: Record<AmenitySlug, AmenityCategoryDef> = {
  convenience: convenienceDef,
  mart: martDef,
  cafe: cafeDef,
  market: marketDef,
};

export function getCategoryDef(slug: string): AmenityCategoryDef | null {
  if ((AMENITY_SLUGS as readonly string[]).includes(slug)) {
    return AMENITY_CATEGORIES[slug as AmenitySlug];
  }
  return null;
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

Run: `pnpm test:unit -- category`
Expected: 4 tests passing.

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/category.ts tests/lib/amenity/category.test.ts
git commit -m "feat(amenity): 카테고리 레지스트리 + getCategoryDef 디스패치"
```

---

## Phase 4 — 서비스 레이어 (list / detail / nearby 확장)

### Task 4.1: `lib/amenity/list.ts` — 카테고리 디스패치 + 페이지네이션 가드

**Files:**
- Create: `lib/amenity/list.ts`
- Create: `tests/lib/amenity/list.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/amenity/list.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { normalizePage } from '@/lib/amenity/list';

describe('normalizePage', () => {
  it('1 미만은 1', () => {
    expect(normalizePage('0')).toBe(1);
    expect(normalizePage('-5')).toBe(1);
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage('abc')).toBe(1);
  });
  it('숫자 그대로', () => {
    expect(normalizePage('3')).toBe(3);
    expect(normalizePage('1')).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm test:unit -- amenity/list`
Expected: 모듈 없음.

- [ ] **Step 3: 작성**

`lib/amenity/list.ts`:

```ts
import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityListFilter, AmenityListResult } from '@/lib/amenity/category';

export function normalizePage(raw: string | undefined): number {
  const n = Number(raw ?? '1');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** 카테고리 슬러그 → 어댑터.getList 디스패치. 미지원 슬러그는 throw. */
export async function getAmenityList(
  slug: string,
  filter: AmenityListFilter,
  page: number,
): Promise<AmenityListResult> {
  const def = getCategoryDef(slug);
  if (!def) throw new Error(`Unknown amenity category: ${slug}`);
  return def.getList(filter, Math.max(1, page));
}
```

- [ ] **Step 4: 테스트 재실행 — 통과**

Run: `pnpm test:unit -- amenity/list`
Expected: 2 tests passing.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/list.ts tests/lib/amenity/list.test.ts
git commit -m "feat(amenity): getAmenityList 디스패치 + normalizePage"
```

---

### Task 4.2: `lib/amenity/detail.ts` — getAmenityById / getAmenityLatLng

**Files:**
- Create: `lib/amenity/detail.ts`

DB 호출이라 단위 테스트는 없음(통합 e2e에서 커버). Phase 6의 페이지가 사용.

- [ ] **Step 1: 작성**

`lib/amenity/detail.ts`:

```ts
import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityItem } from '@/lib/amenity/category';

export async function getAmenityById(slug: string, id: bigint): Promise<AmenityItem | null> {
  const def = getCategoryDef(slug);
  if (!def) return null;
  return def.getById(id);
}

export async function getAmenityLatLng(
  slug: string,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const def = getCategoryDef(slug);
  if (!def) return null;
  return def.getLatLng(id);
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add lib/amenity/detail.ts
git commit -m "feat(amenity): getAmenityById / getAmenityLatLng 디스패치"
```

---

### Task 4.3: `lib/amenity/nearby.ts` 확장 — 카테고리 mixed + 같은 카테고리 N건

**Files:**
- Modify: `lib/amenity/nearby.ts` (추가만)

DETAIL 페이지의 "주변 상권 종합" + "같은 카테고리 N건" 섹션에 필요한 함수 2개 추가.

- [ ] **Step 1: 추가 함수 작성**

`lib/amenity/nearby.ts` 파일 끝에 다음을 append:

```ts
import type { AmenitySlug } from '@/lib/amenity/category';

/**
 * DETAIL "주변 상권 종합" — 현재 카테고리 **제외**한 나머지 카테고리의 가까운 항목들.
 * Store(convenience/mart/cafe) + TraditionalMarket(market)를 단일 호출로.
 */
export async function getMixedNearbyForDetail(
  currentSlug: AmenitySlug,
  lat: number,
  lng: number,
): Promise<{
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  market: NearbyTraditionalMarket[];
}> {
  const [stores, markets] = await Promise.all([
    getNearbyStores(lat, lng, 500),
    getNearbyTraditionalMarkets(lat, lng, 1000),
  ]);
  const convenience = stores.filter((s) => (s.industryCode ?? '').startsWith('G20405'));
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return c.startsWith('G20404') || c.startsWith('G20402');
  });
  const cafe = stores.filter((s) => (s.industryCode ?? '').startsWith('I21201'));
  return {
    convenience: currentSlug === 'convenience' ? [] : convenience.slice(0, 5),
    mart: currentSlug === 'mart' ? [] : mart.slice(0, 5),
    cafe: currentSlug === 'cafe' ? [] : cafe.slice(0, 5),
    market: currentSlug === 'market' ? [] : markets.slice(0, 5),
  };
}

/**
 * "같은 카테고리 가까운 N건" — 현재 row(excludeId)는 제외.
 * convenience/mart/cafe는 Store, market는 TraditionalMarket.
 */
export async function getSameCategoryNearby(
  slug: AmenitySlug,
  lat: number,
  lng: number,
  excludeId: bigint,
  limit = 5,
): Promise<Array<{ id: bigint; name: string; address: string; distanceMeters: number; sub: string | null }>> {
  if (slug === 'market') {
    const rows = await getNearbyTraditionalMarkets(lat, lng, 3000);
    return rows
      .filter((m) => m.id !== excludeId)
      .slice(0, limit)
      .map((m) => ({ id: m.id, name: m.name, address: m.address, distanceMeters: m.distanceMeters, sub: m.marketType }));
  }
  const prefixes = slug === 'convenience' ? ['G20405']
    : slug === 'cafe' ? ['I21201']
    : ['G20404', 'G20402'];
  const stores = await getNearbyStores(lat, lng, 500);
  return stores
    .filter((s) => s.id !== excludeId)
    .filter((s) => prefixes.some((p) => (s.industryCode ?? '').startsWith(p)))
    .slice(0, limit)
    .map((s) => ({ id: s.id, name: s.name, address: s.address, distanceMeters: s.distanceMeters, sub: s.industryName }));
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(amenity): 주변 상권 종합 + 같은 카테고리 N건 함수"
```

---

### Task 4.4: 카테고리 시군구 카운트 디스패치 (허브용)

이미 어댑터마다 `getCountsBySigungu`가 있음. 페이지에서 `getCategoryDef(slug)?.getCountsBySigungu()` 직접 호출하면 끝. 별도 wrapper 불필요. **이 Task는 스킵 — 후속 페이지에서 직접 호출.**

---

## Phase 5 — 공용 UI 컴포넌트 (`amenity-*`)

### Task 5.1: `NearbyApartments` 컴포넌트 승격 (학교 전용 → 공유)

**Files:**
- Create: `components/ui/nearby-apartments.tsx`
- Delete: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-apartments.tsx`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx` (import 경로)

- [ ] **Step 1: 학교 컴포넌트를 `components/ui/`로 이동**

Run:
```bash
git mv /Users/jiyeonjeong/project/imjang-on/app/\(public\)/school/\[sigunguCode\]/\[id\]/_components/nearby-apartments.tsx /Users/jiyeonjeong/project/imjang-on/components/ui/nearby-apartments.tsx
```

- [ ] **Step 2: 학교 DETAIL의 import 경로 갱신**

`app/(public)/school/[sigunguCode]/[id]/page.tsx` 9라인:
```ts
import { NearbyApartments } from '@/components/ui/nearby-apartments';
```

- [ ] **Step 3: 잔여 import 검색**

Run:
```bash
grep -rn "from.*school.*_components/nearby-apartments" /Users/jiyeonjeong/project/imjang-on
```
Expected: 결과 없음.

- [ ] **Step 4: 타입 + 학교 회귀**

Run: `pnpm typecheck && pnpm test:unit`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor(ui): NearbyApartments를 공용 컴포넌트로 승격"
```

---

### Task 5.2: `AmenityCard` 컴포넌트

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-card.tsx`

학교의 `school-card.tsx`(약 23라인) 패턴을 카테고리 중립으로. def·basePath·item을 받음.

- [ ] **Step 1: 작성**

먼저 디렉터리 생성: `mkdir -p /Users/jiyeonjeong/project/imjang-on/app/\(public\)/amenity/\[category\]/_components`

`app/(public)/amenity/[category]/_components/amenity-card.tsx`:

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityCard({ item, def, basePath }: { item: AmenityItem; def: AmenityCategoryDef; basePath: string }) {
  const summary = def.inferRowSummary(item);
  return (
    <Link href={`${basePath}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
            {summary && <Badge tone="blue">{summary}</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{item.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-card.tsx
git commit -m "feat(amenity): AmenityCard — 카테고리 중립 LIST 카드"
```

---

### Task 5.3: `AmenityFilterPanel` (sub-filter 슬롯 포함)

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-filter-panel.tsx`

학교의 `school-filter-panel.tsx`(109라인) 패턴을 카테고리 중립으로. def에서 sub-filter 정의를 받아 동적 렌더.

- [ ] **Step 1: 작성**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import type { AmenityCategoryDef } from '@/lib/amenity/category';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

interface Props {
  def: AmenityCategoryDef;
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function AmenityFilterPanel({ def, basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sub = def.subFilters;
  const sido = p.get('sido');
  const region = p.get('region');

  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);
  useEffect(() => {
    if (!sido) { setSigunguList([]); return; }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((d: SigunguItem[]) => setSigunguList(d))
      .catch(() => setSigunguList([]));
  }, [sido]);

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';

  const subKey = sub?.paramKey ?? 'sub';
  const subCur = sub ? (p.get(subKey) ?? sub.defaultSlug) : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{def.label} 이름</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder={`예) ${def.label}명`}
          className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-sm"
        />
      </section>

      {sidoList && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
          <div className="mt-2 flex flex-col gap-2">
            <select value={sido ?? ''} onChange={(e) => update({ sido: e.target.value || null, region: null })} className={selectCls}>
              <option value="">시도 전체</option>
              {sidoList.map((s) => <option key={s.code} value={s.sido}>{s.fullName}</option>)}
            </select>
            {sigunguList.length > 0 && (
              <select value={region ?? ''} onChange={(e) => update({ region: e.target.value || null })} className={selectCls}>
                <option value="">시군구 전체</option>
                {sigunguList.map((sg) => <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>)}
              </select>
            )}
          </div>
        </section>
      )}

      {sub && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{def.label} 종류</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sub.options.map((opt) => (
              <Chip key={opt.slug} active={subCur === opt.slug}
                onClick={() => update({ [subKey]: opt.slug === sub.defaultSlug ? null : opt.slug })}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-filter-panel.tsx
git commit -m "feat(amenity): AmenityFilterPanel — def 주입식 sub-filter 슬롯"
```

---

### Task 5.4: `AmenityMobileFilterSheet` (모바일 바텀시트)

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-mobile-filter-sheet.tsx`

학교의 `school-mobile-filter-sheet.tsx`(42라인) 패턴. activeCount 계산 시 def.subFilters?.paramKey를 포함.

- [ ] **Step 1: 작성**

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { AmenityFilterPanel } from './amenity-filter-panel';
import type { AmenityCategoryDef } from '@/lib/amenity/category';

interface SidoItem { code: string; sido: string; fullName: string; }

export function AmenityMobileFilterSheet({ def, basePath, sidoList }: { def: AmenityCategoryDef; basePath: string; sidoList?: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeKeys = ['sido', 'q', ...(def.subFilters ? [def.subFilters.paramKey] : [])];
  const activeCount = activeKeys.filter((k) => {
    const v = sp.get(k);
    return v && v !== 'all';
  }).length;

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => { setPending(new URLSearchParams(sp.toString())); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터{activeCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">{activeCount}</span>}
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="필터"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPending(new URLSearchParams())} className="shrink-0">초기화</Button>
            <Button onClick={() => { const qs = pending.toString(); router.push(qs ? `${basePath}?${qs}` : basePath); setOpen(false); }} className="flex-1">조회</Button>
          </div>
        }
      >
        <AmenityFilterPanel def={def} basePath={basePath} sidoList={sidoList} params={pending} onParamsChange={setPending} />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-mobile-filter-sheet.tsx
git commit -m "feat(amenity): AmenityMobileFilterSheet — 모바일 바텀시트, sub-filter 포함"
```

---

### Task 5.5: `AmenityPagination`

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-pagination.tsx`

학교 패턴(28라인) 그대로, 컴포넌트 이름만 변경.

- [ ] **Step 1: 작성**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

export function AmenityPagination({ basePath, current, totalPages, totalItems, perPage }: {
  basePath: string;
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <Pagination
      current={current}
      totalPages={totalPages}
      totalItems={totalItems}
      perPage={perPage}
      onChange={(page) => {
        const params = new URLSearchParams(sp.toString());
        params.set('page', String(page));
        router.push(`${basePath}?${params.toString()}`);
      }}
    />
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-pagination.tsx
git commit -m "feat(amenity): AmenityPagination"
```

---

### Task 5.6: `AmenityHero` (DETAIL 상단)

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-hero.tsx`

학교 `school-hero.tsx`(23라인) 패턴. def·item 주입.

- [ ] **Step 1: 작성**

```tsx
import { Badge } from '@/components/ui/badge';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityHero({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">{def.emoji}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{item.name}</h1>
          <Badge tone="blue">{def.label}</Badge>
          {summary && summary !== def.label && <Badge tone="gray">{summary}</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {item.address}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-hero.tsx
git commit -m "feat(amenity): AmenityHero"
```

---

### Task 5.7: `AmenityInfo` (DETAIL 기본정보 그리드)

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-info.tsx`

학교 `school-info.tsx`(23라인) 패턴. def.detailFields(item) 결과를 렌더.

- [ ] **Step 1: 작성**

```tsx
import { Card } from '@/components/ui/card';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityInfo({ item, def, regionFullName }: { item: AmenityItem; def: AmenityCategoryDef; regionFullName: string }) {
  const rows = [...def.detailFields(item), { label: '지역', value: regionFullName }];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.label} 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{r.label}</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">{r.value || '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-info.tsx
git commit -m "feat(amenity): AmenityInfo — def.detailFields 렌더"
```

---

### Task 5.8: `AmenityDetailSidebar`

**Files:**
- Create: `app/(public)/amenity/[category]/_components/amenity-detail-sidebar.tsx`

학교 `school-detail-sidebar.tsx`(33라인) 패턴. ANCHORS 단순화 (정보·위치·주변 아파트·주변 상권).

- [ ] **Step 1: 작성**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

const ANCHORS = [
  { href: '#info', label: '기본 정보' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
  { href: '#poi', label: '주변 상권 종합' },
  { href: '#same', label: '같은 카테고리' },
];

export function AmenityDetailSidebar({ basePath, others, def }: { basePath: string; others: AmenityItem[]; def: AmenityCategoryDef }) {
  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
        <ul className="flex flex-col gap-2">
          {ANCHORS.map((a) => <li key={a.href}><a href={a.href} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-blue)]">{a.label}</a></li>)}
        </ul>
      </Card>
      {others.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 {def.label}</h3>
          <ul className="flex flex-col gap-2">
            {others.map((it) => <li key={String(it.id)}><Link href={`${basePath}/${it.id}`} className="text-sm hover:text-[var(--color-blue)]">· {it.name}</Link></li>)}
            <li><Link href={basePath} className="text-sm font-semibold text-[var(--color-blue)]">지역 {def.label} 전체 →</Link></li>
          </ul>
        </Card>
      )}
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/amenity-detail-sidebar.tsx
git commit -m "feat(amenity): AmenityDetailSidebar — 앵커 + 같은 지역 다른 N"
```

---

### Task 5.9: `NearbyAmenitiesMixed` (현재 카테고리 제외, 탭형)

**Files:**
- Create: `app/(public)/amenity/[category]/_components/nearby-amenities-mixed.tsx`

학교 `nearby-amenities.tsx`(45라인) 확장. 탭이 4종(convenience/mart/cafe/market) 중 빈 배열은 자동 숨김. 모바일에서 가로 스크롤.

- [ ] **Step 1: 작성**

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyStore, NearbyTraditionalMarket } from '@/lib/amenity/nearby';

interface Props {
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  market: NearbyTraditionalMarket[];
}

type Tab = 'convenience' | 'mart' | 'cafe' | 'market';

export function NearbyAmenitiesMixed({ convenience, mart, cafe, market }: Props) {
  const groups: { key: Tab; label: string; icon: string; items: { id: bigint; name: string; sub: string; dist: number }[] }[] = [
    { key: 'convenience', label: '편의점', icon: '🏪', items: convenience.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '편의점', dist: s.distanceMeters })) },
    { key: 'mart', label: '마트', icon: '🛒', items: mart.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '마트', dist: s.distanceMeters })) },
    { key: 'cafe', label: '카페', icon: '☕', items: cafe.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '카페', dist: s.distanceMeters })) },
    { key: 'market', label: '전통시장', icon: '🏬', items: market.map((m) => ({ id: m.id, name: m.name, sub: m.marketType ?? '전통시장', dist: m.distanceMeters })) },
  ].filter((g) => g.items.length > 0);

  const [tab, setTab] = useState<Tab | null>(groups[0]?.key ?? null);
  if (!tab) return null;
  const active = groups.find((g) => g.key === tab)!;
  return (
    <Card id="poi">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 상권 종합</h2>
      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1">
        {groups.map((g) => (
          <button key={g.key} onClick={() => setTab(g.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === g.key ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] bg-white text-[var(--color-muted)]'}`}>
            {g.label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-[var(--color-line)]">
        {active.items.map((it) => (
          <li key={String(it.id)} className="flex items-center gap-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-soft)] text-base">{active.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.name}<span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.dist}m</span></p>
              {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/nearby-amenities-mixed.tsx
git commit -m "feat(amenity): NearbyAmenitiesMixed — 현재 카테고리 제외, 탭 가로 스크롤"
```

---

### Task 5.10: `SameCategoryNearby`

**Files:**
- Create: `app/(public)/amenity/[category]/_components/same-category-nearby.tsx`

- [ ] **Step 1: 작성**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { AmenityCategoryDef } from '@/lib/amenity/category';

interface Item { id: bigint; name: string; address: string; distanceMeters: number; sub: string | null; }

export function SameCategoryNearby({ items, def, basePath }: { items: Item[]; def: AmenityCategoryDef; basePath: string }) {
  if (items.length === 0) return null;
  return (
    <Card id="same">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.emoji} 가까운 {def.label}</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)}>
            <Link href={`${basePath}/${it.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">{it.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.distanceMeters}m</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{it.address}{it.sub ? ` · ${it.sub}` : ''}</p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/_components/same-category-nearby.tsx
git commit -m "feat(amenity): SameCategoryNearby"
```

---

## Phase 6 — 라우트 (`app/(public)/amenity/[category]/...`)

### Task 6.1: `[category]/page.tsx` — 허브

**Files:**
- Create: `app/(public)/amenity/[category]/page.tsx`

학교의 `school/page.tsx`보다 단순. 카테고리 def 가드 → "지역으로 시작하기" CTA + 시도 picker(서버 컴포넌트) + 인기 시군구 8개.

- [ ] **Step 1: 작성**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSidoList, getAllSigungus } from '@/lib/region';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string }>; }

export async function generateStaticParams() {
  return AMENITY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  return {
    title: `${def.label} 찾기 — 전국`,
    description: `${def.label} 위치와 주변 아파트 실거래가까지 한 화면에서 확인하세요.`,
    alternates: { canonical: `/amenity/${def.slug}` },
  };
}

export default async function AmenityHubPage({ params }: Params) {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) notFound();

  const [sidoList, sigungus, counts] = await Promise.all([
    getSidoList().catch(() => []),
    getAllSigungus().catch(() => []),
    def.getCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  // 인기 시군구 8개 (카운트 내림차순)
  const top = sigungus
    .filter((s): s is typeof s & { sigunguCode: string } => !!s.sigunguCode)
    .map((s) => ({ ...s, count: counts.get(s.sigunguCode) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-8 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의 · {def.breadcrumbLabel}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{def.emoji} {def.label} 찾기</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">시·군·구를 선택하면 해당 지역의 {def.label} 목록과 위치, 주변 아파트 실거래가까지 확인할 수 있어요.</p>
        <Link
          href={`/amenity/${def.slug}/regions`}
          className="mt-4 inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-blue)] transition hover:border-[var(--color-sky)]"
        >
          📍 지역별 {def.label} 찾기 →
        </Link>
      </div>

      {top.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">인기 지역</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {top.map((sg) => (
              <Link key={sg.sigunguCode} href={`/amenity/${def.slug}/${sg.sigunguCode}`}
                className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm transition hover:border-[var(--color-sky)]">
                <span className="font-semibold text-[var(--color-blue-dark)]">{sg.sido} {sg.sigungu}</span>
                <span className="ml-1 text-xs text-[var(--color-muted)]">{sg.count.toLocaleString('ko-KR')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-sm text-[var(--color-muted)]">
        시도를 직접 고르고 싶다면{' '}
        <Link href={`/amenity/${def.slug}/regions`} className="font-semibold text-[var(--color-blue)]">지역별 {def.label} 찾기</Link>로 이동하세요.
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 3: 로컬 dev로 4종 모두 열어보기**

Run: `pnpm dev` (백그라운드)
브라우저로:
- http://localhost:3000/amenity/convenience
- http://localhost:3000/amenity/mart
- http://localhost:3000/amenity/cafe
- http://localhost:3000/amenity/market
- http://localhost:3000/amenity/hospital (→ 404)
모바일 뷰포트(375px)에서도 카드 그리드 깨짐 없는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/page.tsx
git commit -m "feat(amenity): [category]/page.tsx 허브 — 인기 시군구 + 지역별 CTA"
```

---

### Task 6.2: `[category]/regions/page.tsx` — 시·도 → 시군구 트리

**Files:**
- Create: `app/(public)/amenity/[category]/regions/page.tsx`

학교 `school/regions/page.tsx`(63라인) 패턴. def 가드 추가.

- [ ] **Step 1: 작성**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllSigungus } from '@/lib/region';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string }>; }

export async function generateStaticParams() {
  return AMENITY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  return {
    title: `지역별 ${def.label} 찾기 — 전국 시군구`,
    description: `전국 시·군·구별 ${def.label} 위치와 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}/regions` },
  };
}

export default async function AmenityRegionsPage({ params }: Params) {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) notFound();

  const [sigungus, counts] = await Promise.all([
    getAllSigungus().catch(() => []),
    def.getCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  const bySido = new Map<string, typeof sigungus>();
  for (const s of sigungus) {
    if (!s.sigunguCode) continue;
    const arr = bySido.get(s.sido) ?? [];
    arr.push(s);
    bySido.set(s.sido, arr);
  }

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">지역별</span>
      </nav>

      <h1 className="mb-2 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">지역별 {def.label} 찾기</h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">시·군·구를 선택하면 해당 지역의 {def.label} 목록으로 이동합니다.</p>

      <div className="flex flex-col gap-8">
        {[...bySido.entries()].map(([sido, list]) => (
          <div key={sido}>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{sido}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {list.map((sg) => (
                <Link
                  key={sg.sigunguCode}
                  href={`/amenity/${def.slug}/${sg.sigunguCode}`}
                  className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm transition hover:border-[var(--color-sky)]"
                >
                  <span className="font-semibold text-[var(--color-blue-dark)]">{sg.sigungu}</span>
                  <span className="ml-1 text-xs text-[var(--color-muted)]">
                    {(counts.get(sg.sigunguCode!) ?? 0).toLocaleString('ko-KR')}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 로컬 dev로 4종 regions 확인**

브라우저로:
- http://localhost:3000/amenity/mart/regions
- http://localhost:3000/amenity/market/regions
모바일에서 그리드 2열 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/regions/page.tsx
git commit -m "feat(amenity): regions 페이지 — 시·도 → 시군구 트리"
```

---

### Task 6.3: `[category]/[sigunguCode]/page.tsx` — 시군구 LIST

**Files:**
- Create: `app/(public)/amenity/[category]/[sigunguCode]/page.tsx`

학교 `school/[sigunguCode]/page.tsx`(95라인) 패턴.

- [ ] **Step 1: 작성**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSigunguByCode, getSidoList } from '@/lib/region';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';
import { getAmenityList, normalizePage } from '@/lib/amenity/list';
import { AmenityFilterPanel } from '../_components/amenity-filter-panel';
import { AmenityMobileFilterSheet } from '../_components/amenity-mobile-filter-sheet';
import { AmenityCard } from '../_components/amenity-card';
import { AmenityPagination } from '../_components/amenity-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ category: string; sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sigunguCode } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  const r = await getSigunguByCode(sigunguCode).catch(() => null);
  if (!r) return {};
  return {
    title: `${r.fullName} ${def.label}`,
    description: `${r.fullName}의 ${def.label} 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}/${sigunguCode}` },
  };
}

export default async function AmenitySigunguListPage({ params, searchParams }: Params) {
  const { category, sigunguCode } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) notFound();
  const region = await getSigunguByCode(sigunguCode);
  if (!region || !region.sigunguCode) notFound();

  const basePath = `/amenity/${def.slug}/${sigunguCode}`;
  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';

  const [{ rows, total, totalPages, perPage }, sidoList] = await Promise.all([
    getAmenityList(def.slug, {
      sigunguCode,
      q: sp.q,
      sub: sp[subKey],
    }, page),
    getSidoList().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">{def.breadcrumbLabel} · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} {def.label}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {total.toLocaleString('ko-KR')}개 · <Link href={`/amenity/${def.slug}`} className="font-semibold text-[var(--color-blue)]">전국에서 검색 →</Link></p>
      </div>

      <Suspense><AmenityMobileFilterSheet def={def} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <AmenityFilterPanel def={def} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 {def.label}</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 {def.label}이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((it) => <AmenityCard key={String(it.id)} item={it} def={def} basePath={basePath} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><AmenityPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 로컬 dev로 4종 시군구 LIST 확인**

브라우저로 (강남구 = 11680):
- http://localhost:3000/amenity/convenience/11680
- http://localhost:3000/amenity/mart/11680 → sub=hyper 등 적용해보기
- http://localhost:3000/amenity/market/11680
페이지네이션, sub-filter 칩 동작, 모바일에서 "필터" 버튼 → 바텀시트 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/\[sigunguCode\]/page.tsx
git commit -m "feat(amenity): 시군구 LIST 페이지 — 필터·페이지네이션·모바일 시트"
```

---

### Task 6.4: `[category]/[sigunguCode]/[id]/page.tsx` — DETAIL

**Files:**
- Create: `app/(public)/amenity/[category]/[sigunguCode]/[id]/page.tsx`

학교 `school/[sigunguCode]/[id]/page.tsx`(90라인) 패턴 + "주변 상권 종합" + "같은 카테고리".

- [ ] **Step 1: 작성**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';
import { getAmenityById, getAmenityLatLng } from '@/lib/amenity/detail';
import { getAmenityList } from '@/lib/amenity/list';
import { getSigunguByCode } from '@/lib/region';
import {
  getNearbyApartments,
  getMixedNearbyForDetail,
  getSameCategoryNearby,
} from '@/lib/amenity/nearby';
import { AmenityHero } from '../../_components/amenity-hero';
import { AmenityInfo } from '../../_components/amenity-info';
import { AmenityDetailSidebar } from '../../_components/amenity-detail-sidebar';
import { NearbyAmenitiesMixed } from '../../_components/nearby-amenities-mixed';
import { SameCategoryNearby } from '../../_components/same-category-nearby';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';
import type { AmenitySlug } from '@/lib/amenity/category';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string; sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sigunguCode, id } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  const item = await getAmenityById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name}(${item.address}) ${def.label} 정보와 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}/${sigunguCode}/${id}` },
  };
}

export default async function AmenityDetailPage({ params }: Params) {
  const { category, sigunguCode, id } = await params;
  const def = getCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const [item, region] = await Promise.all([
    getAmenityById(def.slug, itemId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!item || !region || item.sigunguCode !== sigunguCode) notFound();

  const basePath = `/amenity/${def.slug}/${sigunguCode}`;
  const coord = await getAmenityLatLng(def.slug, itemId);

  type MixedT = Awaited<ReturnType<typeof getMixedNearbyForDetail>>;
  type SameT = Awaited<ReturnType<typeof getSameCategoryNearby>>;
  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getMixedNearbyForDetail(def.slug as AmenitySlug, coord.lat, coord.lng) : Promise.resolve({ convenience: [], mart: [], cafe: [], market: [] } as MixedT),
    coord ? getSameCategoryNearby(def.slug as AmenitySlug, coord.lat, coord.lng, itemId) : Promise.resolve([] as SameT),
    getAmenityList(def.slug, { sigunguCode }, 1),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        <Link href={basePath}>{region.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <AmenityHero item={item} def={def} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <AmenityInfo item={item} def={def} regionFullName={region.fullName} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          )}
          {!coord && (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <SameCategoryNearby items={sameCat} def={def} basePath={basePath} />}
        </main>
        <aside><AmenityDetailSidebar basePath={basePath} others={others} def={def} /></aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 로컬 dev로 DETAIL 확인**

브라우저로:
- 시군구 LIST에서 카드 하나 클릭 → DETAIL로 진입
- Hero·기본정보·지도·주변 아파트·주변 상권 종합 탭·같은 카테고리 모두 노출 확인
- 다른 카테고리(`/amenity/cafe/11680/<id>`)도 동일 페이지가 카테고리 라벨/탭만 다르게 보이는지
- 잘못된 ID(`/amenity/mart/11680/99999999`) → 404
- 다른 시군구 ID(`/amenity/mart/11110/<강남id>`) → 404
모바일 뷰포트에서 사이드바가 아래로 가는지, 탭이 가로 스크롤되는지.

- [ ] **Step 3: 타입체크 + 단위**

Run: `pnpm typecheck && pnpm test:unit`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/amenity/\[category\]/\[sigunguCode\]/\[id\]/page.tsx
git commit -m "feat(amenity): DETAIL 페이지 — Hero·지도·주변 아파트·주변 상권·같은 카테고리"
```

---

## Phase 7 — 메뉴 라이브 전환 + e2e

### Task 7.1: `life-menu.ts` 4종 `live: true` + href 갱신

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`
- Modify: `tests/lib/life-menu.test.ts` (있다면)

- [ ] **Step 1: `life-menu.ts` 상권·편의 그룹 변경**

`app/(public)/_components/life-menu.ts`의 `상권·편의` 그룹을 다음으로 교체:

```ts
  {
    label: '상권·편의',
    items: [
      { label: '편의점', href: '/amenity/convenience', live: true },
      { label: '마트', href: '/amenity/mart', live: true },
      { label: '카페', href: '/amenity/cafe', live: true },
      { label: '전통시장', href: '/amenity/market', live: true },
    ],
  },
```

- [ ] **Step 2: 테스트 회귀**

Run: `pnpm test:unit -- life-menu`
Expected: 통과 (기존 테스트가 live 카운트나 항목 슬러그를 assert한다면 갱신 필요. 실패 시 그 케이스 수정.)

- [ ] **Step 3: 모바일 드로어 e2e 회귀 확인**

Run: `pnpm test:e2e -- mobile-nav` (또는 `life-menu`)
Expected: 통과. 4종이 live 상태로 클릭 시 SoonModal 대신 라우팅 동작.

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/_components/life-menu.ts tests/lib/life-menu.test.ts
git commit -m "feat(nav): 상권·편의 4종 라이브 전환 (/amenity/[category])"
```

---

### Task 7.2: e2e — 데스크탑 mart happy path

**Files:**
- Create: `tests/e2e/amenity-mart.spec.ts`

대표 1종만 e2e로 검증. 나머지 3종은 어댑터 단위 + 페이지 컴포넌트 신뢰.

- [ ] **Step 1: 작성**

```ts
import { test, expect } from '@playwright/test';

test.describe('amenity mart happy path', () => {
  test('허브 → regions → 시군구 LIST → sub-filter → DETAIL', async ({ page }) => {
    await page.goto('/amenity/mart');
    await expect(page.getByRole('heading', { name: /마트 찾기/ })).toBeVisible();

    await page.getByRole('link', { name: /지역별 마트 찾기/ }).click();
    await expect(page).toHaveURL('/amenity/mart/regions');

    // 첫 번째 시군구 카드 클릭
    const firstSigungu = page.locator('a[href^="/amenity/mart/"]').first();
    await firstSigungu.click();
    await expect(page).toHaveURL(/\/amenity\/mart\/\d+/);

    // sub-filter "대형마트" 클릭
    await page.getByRole('button', { name: '대형마트' }).click();
    await expect(page).toHaveURL(/sub=hyper/);

    // 첫 카드(=Link 래퍼) 클릭 → DETAIL
    const firstCard = page.locator('a:has(article)').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.getByText('주변 아파트')).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: 실행**

Run: `pnpm test:e2e -- amenity-mart`
Expected: 통과. 실패 시 데이터가 부족한 시군구가 첫 번째일 수 있으므로 `.first()` 선택자 또는 강남구(11680) 고정으로 변경.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/amenity-mart.spec.ts
git commit -m "test(e2e): amenity mart happy path (sub-filter + DETAIL)"
```

---

### Task 7.3: e2e — 모바일 뷰포트 mart happy path

**Files:**
- Modify: `tests/e2e/amenity-mart.spec.ts`

위 spec에 모바일 시나리오 추가 — 바텀시트 동작 확인.

- [ ] **Step 1: 모바일 케이스 추가**

`amenity-mart.spec.ts`에 추가:

```ts
test.describe('amenity mart mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('모바일 시군구 LIST에서 바텀시트 필터로 sub 적용', async ({ page }) => {
    // 강남구 (11680)로 고정 — Store 데이터가 풍부함
    await page.goto('/amenity/mart/11680');
    await expect(page.getByRole('heading', { name: /마트/ })).toBeVisible();

    // 데스크탑 사이드바는 숨김 (md:block)
    // 모바일 필터 버튼 노출
    const filterBtn = page.getByRole('button', { name: /필터/ });
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // 바텀시트 안에서 "대형마트" 선택
    await page.getByRole('button', { name: '대형마트' }).click();
    await page.getByRole('button', { name: '조회' }).click();

    await expect(page).toHaveURL(/sub=hyper/);
  });
});
```

- [ ] **Step 2: 실행**

Run: `pnpm test:e2e -- amenity-mart`
Expected: 두 시나리오 모두 통과.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/amenity-mart.spec.ts
git commit -m "test(e2e): amenity mart 모바일 바텀시트 필터"
```

---

### Task 7.4: 모바일 드로어 메뉴 회귀

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 기존 모바일 드로어 e2e 회귀**

Run: `pnpm test:e2e -- mobile-nav`
Expected: 통과. 생활편의 → 상권·편의 → 편의점 클릭 시 `/amenity/convenience`로 이동 (SoonModal 아님).

실패 시: `mobile-drawer.tsx`의 아코디언 클릭 핸들러가 `live`를 확인하지 않고 SoonModal을 띄우면 그쪽 수정. 학교가 이미 live로 동작 중이므로 보통 별도 작업 불필요.

---

## Phase 8 — 시안 대조 + SEO 마무리

### Task 8.1: `html/list.html`·`html/detail.html` 시각 대조

**Files:** (검증만; 결과에 따라 8.2에서 보정)

- [ ] **Step 1: 시안 vs 실제 비교**

`html/list.html`을 브라우저로 열고 `/amenity/mart/11680`과 나란히 비교:
- 헤로 카드 패딩·radius·typography
- 좌측 사이드바 폭(280px), 카드 그라데이션·shadow
- 카드 row 높이, 거리 칩 위치

`html/detail.html`과 `/amenity/mart/11680/<id>` 비교:
- Hero 좌측 아이콘 박스(64px)
- 사이드바 폭(320px), 앵커 목록 간격
- 지도 카드 높이, "주변 아파트" 리스트 row

- [ ] **Step 2: 차이점 메모 후 8.2에서 수정**

차이가 있다면 컴포넌트 파일을 수정하고 한 묶음 커밋.

---

### Task 8.2: 메타·SEO 마무리

**Files:** (필요 시 수정)

- [ ] **Step 1: sitemap 확인**

`app/(public)/sitemap.ts` 등 사이트맵 생성 로직이 있는지 확인:
```bash
ls /Users/jiyeonjeong/project/imjang-on/app/sitemap.* /Users/jiyeonjeong/project/imjang-on/app/\(public\)/sitemap.* 2>/dev/null
```
있다면 amenity 카테고리 4종(허브) + 인기 시군구 일부를 sitemap에 추가. 없다면 본 Task 스킵.

- [ ] **Step 2: robots/canonical 확인**

생성된 metadata의 `canonical`이 4종 모두 올바른지(`/amenity/<slug>/<sigungu>/<id>`) 페이지별로 view-source로 확인.

- [ ] **Step 3: 최종 검증**

```bash
pnpm typecheck && pnpm test:unit && pnpm test:e2e
```
Expected: 모두 통과.

- [ ] **Step 4: 최종 커밋 (수정 사항 있을 시)**

```bash
git add -A
git commit -m "polish(amenity): 시안 대조 보정 + SEO 마무리"
```

---

## 자체 점검 (Self-Review)

스펙 대비 커버리지:

| 스펙 섹션 | 구현 Task |
|---|---|
| §2 schema 변경 | Task 1.1, 1.2, 1.3 |
| §2 nearby 이전 | Task 2.1 |
| §3 IA & 라우팅 | Task 6.1~6.4 |
| §4 데이터 모델 사용 (Store/Market) | Task 3.2~3.5 |
| §4.1 sigunguCode 컬럼 | Task 1.1 |
| §4.2 marketType 매핑 | Task 3.5 Step 1 + classifyMarketSub |
| §5.1 파일 트리 | Task 3.1~5.10 + 6.x |
| §5.2 AmenityCategoryDef | Task 3.1 |
| §5.3 메뉴 전환 | Task 7.1 |
| §6 데이터 흐름 (LIST/DETAIL) | Task 6.3, 6.4 |
| §7 에러 처리 | Task 6.1~6.4의 notFound·빈 상태·좌표 NULL 카드 |
| §8 테스트 | Task 3.2~3.6 어댑터 단위, Task 4.1, 7.2~7.4 e2e |
| §9 마일스톤 | 전 Phase 정렬 일치 |

모바일 명시 작업: Task 5.4(바텀시트), Task 5.9(탭 가로 스크롤), Task 6.1·6.2(그리드 반응형), Task 6.3·6.4(`md:block` 사이드바), Task 7.3(모바일 e2e), Task 7.4(드로어 회귀).

---
