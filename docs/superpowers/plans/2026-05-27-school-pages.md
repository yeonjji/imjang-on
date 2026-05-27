# 학교찾기 페이지 + 생활인프라 메뉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집된 학교 데이터(12,560건)로 지역 드릴다운 기반 학교찾기 목록·상세 페이지를 만들고, 생활인프라 허브(`/life`)·메뉴·푸터 IA를 추가한다.

**Architecture:** 기존 `/region`·`/list`·`/apt/[id]` 패턴을 그대로 따른다. `School`에 `sigunguCode`를 추가해 Property와 동일한 지역 쿼리 구조를 갖추고, 도로명주소→시군구 매핑은 순수 함수로 TDD한 뒤 1회성 백필로 채운다. 페이지는 ISR. 학교 상세는 PostGIS 반경 쿼리로 주변 아파트·인프라를 연결한다.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL(PostGIS), Tailwind v4, Vitest(node, 순수함수 단위), 네이버 지도 JS v3.

**스펙:** `docs/superpowers/specs/2026-05-27-school-pages-design.md`
**시각 레퍼런스(스타일 source of truth):** `html/school-list.html`, `html/school-detail.html`

**검증 명령(공통):**
- 타입: `pnpm tsc --noEmit`
- 린트: `pnpm eslint <files>`
- 단위테스트: `pnpm vitest run tests/lib/<file>.test.ts`
- 빌드: `pnpm build`
- Prisma 마이그레이션: `pnpm prisma:migrate`(= `dotenv -e .env.local -- prisma migrate dev`)

---

## Phase 0 — 스키마 & 데이터 준비

### Task 1: School.sigunguCode 컬럼 + 인덱스 추가

**Files:**
- Modify: `prisma/schema.prisma:248-265` (School 모델)

- [ ] **Step 1: 스키마에 컬럼·인덱스 추가**

`School` 모델에 `sigunguCode`와 인덱스를 추가한다(Property와 동일 체계, 5자리).

```prisma
model School {
  id         BigInt                                @id @default(autoincrement())
  sourceId   String                                @unique @db.VarChar(80)
  name       String                                @db.VarChar(100)
  address    String                                @db.VarChar(200)
  location   Unsupported("geography(Point,4326)")?
  schoolKind String?                               @db.VarChar(20)
  foundType  String?                               @db.VarChar(20)
  coeduType  String?                               @db.VarChar(20)
  region     String?                               @db.VarChar(20)
  eduOffice  String?                               @db.VarChar(40)
  tel        String?                               @db.VarChar(30)
  homepage   String?                               @db.VarChar(200)
  sigunguCode String?                              @db.VarChar(5)
  updatedAt  DateTime                              @updatedAt

  @@index([schoolKind])
  @@index([region])
  @@index([sigunguCode, schoolKind])
}
```

- [ ] **Step 2: 마이그레이션 생성·적용**

Run: `pnpm prisma:migrate` → 이름 입력 프롬프트에 `add_school_sigungu_code`
Expected: `School` 테이블에 `sigunguCode` 컬럼과 인덱스가 추가되고 `prisma generate` 완료.

- [ ] **Step 3: 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 통과(에러 0).

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(school): add sigunguCode column and index"
```

---

### Task 2: 도로명주소 → 시군구 매칭 순수 함수 (TDD)

학교 백필의 핵심 로직. DB 없이 단위 테스트 가능하도록 Region 목록을 인자로 받는 순수 함수로 만든다.

**Files:**
- Create: `scripts/ingest/amenities/match-sigungu.ts`
- Test: `tests/lib/match-sigungu.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/match-sigungu.test.ts
import { describe, it, expect } from 'vitest';
import { matchSigunguCode, type RegionRef } from '@/scripts/ingest/amenities/match-sigungu';

const regions: RegionRef[] = [
  { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
  { sido: '경기도', sigungu: '성남시 분당구', sigunguCode: '41135' },
  { sido: '경기도', sigungu: '성남시 수정구', sigunguCode: '41131' },
  { sido: '부산광역시', sigungu: '해운대구', sigunguCode: '26350' },
  { sido: '강원특별자치도', sigungu: '춘천시', sigunguCode: '51110' },
];

describe('matchSigunguCode', () => {
  it('단일 구 주소를 매칭한다', () => {
    expect(matchSigunguCode('서울특별시 강남구 개포로109길 21', regions)).toBe('11680');
  });
  it('시+구 2토큰 시군구를 가장 긴 접두로 매칭한다', () => {
    expect(matchSigunguCode('경기도 성남시 분당구 불정로 6', regions)).toBe('41135');
  });
  it('광역시 자치구를 매칭한다', () => {
    expect(matchSigunguCode('부산광역시 해운대구 우동 1', regions)).toBe('26350');
  });
  it('특별자치도 시를 매칭한다', () => {
    expect(matchSigunguCode('강원특별자치도 춘천시 시청길 11', regions)).toBe('51110');
  });
  it('연속 공백·앞뒤 공백을 정규화한다', () => {
    expect(matchSigunguCode('  서울특별시   강남구  테헤란로 1 ', regions)).toBe('11680');
  });
  it('목록에 없으면 null', () => {
    expect(matchSigunguCode('제주특별자치도 서귀포시 1', regions)).toBeNull();
  });
  it('빈 문자열이면 null', () => {
    expect(matchSigunguCode('', regions)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/match-sigungu.test.ts`
Expected: FAIL — 모듈/함수 없음.

- [ ] **Step 3: 구현**

```ts
// scripts/ingest/amenities/match-sigungu.ts
export interface RegionRef {
  sido: string;
  sigungu: string;
  sigunguCode: string;
}

// 도로명/지번 주소 앞부분(시도 + 시군구)을 Region 목록과 대조해 sigunguCode를 찾는다.
// 같은 시 아래 여러 구(예: 성남시 분당구/수정구)는 "시도 시군구" 접두가 가장 긴 항목을 택한다.
export function matchSigunguCode(address: string, regions: RegionRef[]): string | null {
  const norm = address.replace(/\s+/g, ' ').trim();
  if (!norm) return null;

  let best: { code: string; len: number } | null = null;
  for (const r of regions) {
    const key = `${r.sido} ${r.sigungu}`;
    if (norm.startsWith(key) && (best === null || key.length > best.len)) {
      best = { code: r.sigunguCode, len: key.length };
    }
  }
  return best?.code ?? null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/match-sigungu.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: 린트**

Run: `pnpm eslint scripts/ingest/amenities/match-sigungu.ts tests/lib/match-sigungu.test.ts`
Expected: 통과.

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/match-sigungu.ts tests/lib/match-sigungu.test.ts
git commit -m "feat(school): add address->sigungu matcher with tests"
```

---

### Task 3: 학교 시군구 백필 스크립트

**Files:**
- Create: `scripts/ingest/amenities/school-region-backfill.ts`
- Modify: `package.json` (scripts 블록)

- [ ] **Step 1: 백필 스크립트 작성**

Region level-2 전체를 메모리에 올리고, 좌표가 아니라 주소 접두로 매칭해 `School.sigunguCode`를 채운다. 매칭 실패는 카운트·샘플 로깅.

```ts
// scripts/ingest/amenities/school-region-backfill.ts
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { matchSigunguCode, type RegionRef } from './match-sigungu';

const BATCH = 1000;

async function main() {
  const regions: RegionRef[] = (
    await prisma.region.findMany({
      where: { level: 2, isAbolished: false, sigunguCode: { not: null } },
      select: { sido: true, sigungu: true, sigunguCode: true },
    })
  )
    .filter((r): r is { sido: string; sigungu: string; sigunguCode: string } =>
      !!r.sigungu && !!r.sigunguCode,
    )
    .map((r) => ({ sido: r.sido, sigungu: r.sigungu, sigunguCode: r.sigunguCode }));

  logger.info({ regions: regions.length }, 'school backfill: regions loaded');

  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];
  let cursor = 0n;

  for (;;) {
    const schools = await prisma.school.findMany({
      where: { id: { gt: cursor } },
      select: { id: true, address: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (schools.length === 0) break;

    for (const s of schools) {
      const code = matchSigunguCode(s.address, regions);
      if (code) {
        await prisma.school.update({ where: { id: s.id }, data: { sigunguCode: code } });
        matched++;
      } else {
        unmatched++;
        if (unmatchedSamples.length < 20) unmatchedSamples.push(s.address);
      }
    }
    cursor = schools[schools.length - 1].id;
    logger.info({ matched, unmatched }, 'school backfill progress');
  }

  logger.info({ matched, unmatched, unmatchedSamples }, 'school backfill done');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'school backfill fatal');
  process.exit(1);
});
```

- [ ] **Step 2: package.json에 실행 스크립트 추가**

`scripts` 블록의 `seed:regions` 아래에 추가:

```json
"backfill:school-region": "dotenv -e .env.local -- tsx scripts/ingest/amenities/school-region-backfill.ts",
```

- [ ] **Step 3: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint scripts/ingest/amenities/school-region-backfill.ts`
Expected: 통과.

- [ ] **Step 4: 백필 실행 (Supabase 쓰기 — 1회성)**

Run: `pnpm backfill:school-region`
Expected: 로그 `school backfill done` 에서 `matched` ≈ 12,000+ , `unmatched` 적음(목표 매칭률 95%+). `unmatchedSamples` 확인해 패턴 이상 시 Task 2 보강.

- [ ] **Step 5: 매칭률 검증**

매칭률이 낮으면(<90%) `unmatchedSamples`의 시도/시군구 표기와 Region 시드 표기(예: 강원도 vs 강원특별자치도) 차이를 확인하고 Task 2 테스트에 케이스 추가 후 재실행. 양호하면 다음 단계로.

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/amenities/school-region-backfill.ts package.json
git commit -m "feat(school): add sigunguCode backfill script"
```

---

## Phase 1 — lib 레이어

### Task 4: 생활인프라 카테고리 매핑 (TDD)

상세 "주변 인프라" 탭과 `/life` 허브가 쓰는 카테고리↔Store 업종코드 매핑.

**Files:**
- Create: `lib/amenity-category.ts`
- Test: `tests/lib/amenity-category.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
// tests/lib/amenity-category.test.ts
import { describe, it, expect } from 'vitest';
import { storeIndustryToCategory } from '@/lib/amenity-category';

describe('storeIndustryToCategory', () => {
  it('편의점·슈퍼·대형마트·카페는 mart', () => {
    for (const c of ['G20405', 'G20404', 'G20402', 'I21201']) {
      expect(storeIndustryToCategory(c)).toBe('mart');
    }
  });
  it('약국·병원·의원은 medical', () => {
    for (const c of ['G21501', 'Q101', 'Q102']) {
      expect(storeIndustryToCategory(c)).toBe('medical');
    }
  });
  it('소분류 코드 접두로도 매칭한다(상세 코드 변형 대비)', () => {
    expect(storeIndustryToCategory('Q10103')).toBe('medical');
  });
  it('미지정/모르는 코드는 null', () => {
    expect(storeIndustryToCategory(null)).toBeNull();
    expect(storeIndustryToCategory('Z999')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/amenity-category.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// lib/amenity-category.ts
export type AmenityCategory = 'school' | 'medical' | 'mart' | 'park' | 'charger';

// Store.industryCode 접두 → 카테고리. (adapter-store.ts STORE_UPJONG_TARGETS 기준)
const STORE_PREFIX: Array<{ prefix: string; category: AmenityCategory }> = [
  { prefix: 'G20405', category: 'mart' },    // 편의점
  { prefix: 'G20404', category: 'mart' },    // 슈퍼마켓
  { prefix: 'G20402', category: 'mart' },    // 대형마트
  { prefix: 'I21201', category: 'mart' },    // 카페
  { prefix: 'G21501', category: 'medical' }, // 약국
  { prefix: 'Q101', category: 'medical' },   // 병원
  { prefix: 'Q102', category: 'medical' },   // 의원
];

export function storeIndustryToCategory(code: string | null): AmenityCategory | null {
  if (!code) return null;
  for (const { prefix, category } of STORE_PREFIX) {
    if (code.startsWith(prefix)) return category;
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/amenity-category.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity-category.ts tests/lib/amenity-category.test.ts
git commit -m "feat(amenity): add store industry -> category mapping"
```

---

### Task 5: lib/school.ts — 목록·단건·카운트 쿼리

**Files:**
- Create: `lib/school.ts`
- Test: `tests/lib/school-filter.test.ts`

학교 필터 enum과 where-builder는 순수 함수로 분리해 TDD하고, DB 호출 함수는 그 위에 둔다.

- [ ] **Step 1: where-builder 실패 테스트**

```ts
// tests/lib/school-filter.test.ts
import { describe, it, expect } from 'vitest';
import { buildSchoolWhere } from '@/lib/school';

describe('buildSchoolWhere', () => {
  it('시군구만 있으면 sigunguCode 조건', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680' })).toEqual({ sigunguCode: '11680' });
  });
  it('학교급 필터를 schoolKind로 매핑', () => {
    const w = buildSchoolWhere({ sigunguCode: '11680', kind: 'elem' });
    expect(w.schoolKind).toBe('초등학교');
  });
  it('설립·남녀공학 필터', () => {
    const w = buildSchoolWhere({ sigunguCode: '11680', found: 'public', coedu: 'co' });
    expect(w.foundType).toBe('공립');
    expect(w.coeduType).toBe('남녀공학');
  });
  it('이름 검색은 contains', () => {
    const w = buildSchoolWhere({ sigunguCode: '11680', q: '대청' });
    expect(w.name).toEqual({ contains: '대청' });
  });
  it('전체(all) 값은 조건에서 제외', () => {
    const w = buildSchoolWhere({ sigunguCode: '11680', kind: 'all', found: 'all', coedu: 'all' });
    expect(w.schoolKind).toBeUndefined();
    expect(w.foundType).toBeUndefined();
    expect(w.coeduType).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/school-filter.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

NEIS 표기값 확인: `schoolKind`는 `초등학교/중학교/고등학교`, 특수는 별도 표기(예: `특수학교`). `foundType`은 `공립/사립/국립`(국공립 필터는 국립+공립 포함), `coeduType`은 `남녀공학/남/여`.

```ts
// lib/school.ts
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type SchoolKindSlug = 'all' | 'elem' | 'mid' | 'high' | 'special';
export type FoundSlug = 'all' | 'public' | 'private';
export type CoeduSlug = 'all' | 'male' | 'female' | 'co';

export interface SchoolFilter {
  sigunguCode: string;
  kind?: SchoolKindSlug;
  found?: FoundSlug;
  coedu?: CoeduSlug;
  q?: string;
}

const KIND_MAP: Record<Exclude<SchoolKindSlug, 'all'>, string> = {
  elem: '초등학교',
  mid: '중학교',
  high: '고등학교',
  special: '특수학교',
};

export function buildSchoolWhere(f: SchoolFilter): Prisma.SchoolWhereInput {
  const where: Prisma.SchoolWhereInput = { sigunguCode: f.sigunguCode };
  if (f.kind && f.kind !== 'all') where.schoolKind = KIND_MAP[f.kind];
  if (f.found === 'public') where.foundType = { in: ['공립', '국립'] } as Prisma.StringNullableFilter;
  else if (f.found === 'private') where.foundType = '사립';
  if (f.coedu === 'co') where.coeduType = '남녀공학';
  else if (f.coedu === 'male') where.coeduType = '남';
  else if (f.coedu === 'female') where.coeduType = '여';
  if (f.q) where.name = { contains: f.q };
  return where;
}

const PER_PAGE = 30;

export async function getSchoolsBySigungu(f: SchoolFilter, page = 1) {
  const where = buildSchoolWhere(f);
  const [rows, total] = await Promise.all([
    prisma.school.findMany({
      where,
      orderBy: [{ schoolKind: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.school.count({ where }),
  ]);
  return { rows, total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

export async function getSchoolById(id: bigint) {
  return prisma.school.findUnique({ where: { id } });
}

export async function getSchoolKindCounts(sigunguCode: string) {
  const grouped = await prisma.school.groupBy({
    by: ['schoolKind'],
    where: { sigunguCode },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const g of grouped) {
    counts[g.schoolKind ?? '기타'] = g._count._all;
    total += g._count._all;
  }
  return { total, counts };
}

// /school 허브: 시군구별 학교 수 (전국)
export async function getSchoolCountsBySigungu() {
  const grouped = await prisma.school.groupBy({
    by: ['sigunguCode'],
    where: { sigunguCode: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}
```

> **참고:** NEIS의 특수학교 `schoolKind` 실제 표기는 백필 후 `SELECT DISTINCT "schoolKind" FROM "School"` 로 확인하고 `KIND_MAP.special` 값을 실제 표기에 맞춘다. (Step 5)

- [ ] **Step 4: 통과 확인 + 타입**

Run: `pnpm vitest run tests/lib/school-filter.test.ts && pnpm tsc --noEmit`
Expected: PASS, 타입 통과.

- [ ] **Step 5: schoolKind 실제값 확인**

`pnpm prisma studio` 또는 임시 쿼리로 `School.schoolKind` distinct 값을 확인하고 `KIND_MAP` 값 정합성 보정(특히 특수학교 표기).

- [ ] **Step 6: 커밋**

```bash
git add lib/school.ts tests/lib/school-filter.test.ts
git commit -m "feat(school): add school list/detail/count queries"
```

---

### Task 6: lib/amenity.ts — 주변 아파트 + 공원 추가

**Files:**
- Modify: `lib/amenity.ts` (끝에 함수 추가)

기존 `getNearbyEvChargers`/`getNearbyTraditionalMarkets`/`getNearbyStores` 패턴을 그대로 따른다. 임의 좌표(lat/lng) 기준 주변 아파트와 공원 조회를 추가하고, 상세 탭용 묶음 함수를 만든다.

- [ ] **Step 1: 함수 추가**

```ts
// lib/amenity.ts 에 추가
import { PropertyType } from '@prisma/client';

export interface NearbyApartment {
  id: bigint;
  name: string;
  region: string;
  builtYear: number | null;
  households: number | null;
  saleLastPrice: number | null;
  jeonseLastDeposit: number | null;
  distanceMeters: number;
}

export async function getNearbyApartments(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 10,
): Promise<NearbyApartment[]> {
  return prisma.$queryRaw<NearbyApartment[]>`
    SELECT
      p.id, p.name, r."fullName" AS region, p."builtYear", p.households,
      p."saleLastPrice"::float AS "saleLastPrice",
      p."jeonseLastDeposit"::float AS "jeonseLastDeposit",
      ROUND(ST_Distance(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE p."propertyType" = ${PropertyType.APARTMENT}::"PropertyType"
      AND p.location IS NOT NULL
      AND p."txCount12m" > 0
      AND ST_DWithin(
        p.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit}
  `;
}

export interface NearbyPark {
  id: bigint;
  name: string;
  address: string;
  parkType: string | null;
  area: number | null;
  distanceMeters: number;
}

export async function getNearbyParks(
  lat: number,
  lng: number,
  radiusMeters = 1000,
): Promise<NearbyPark[]> {
  return prisma.$queryRaw<NearbyPark[]>`
    SELECT id, name, address, "parkType", area,
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Park"
    WHERE ST_DWithin(
      location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters}
    )
    ORDER BY "distanceMeters"
    LIMIT 5
  `;
}

// 학교 상세 "주변 생활 인프라" 탭(공원 / 마트·편의 / 충전소). 병원·약국은 보류(제외).
export async function getSchoolNearbyAmenities(lat: number, lng: number) {
  const [parks, stores, chargers] = await Promise.all([
    getNearbyParks(lat, lng),
    getNearbyStores(lat, lng),
    getNearbyEvChargers(lat, lng),
  ]);
  // mart 카테고리만 노출(병원·약국 제외)
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return ['G20405', 'G20404', 'G20402', 'I21201'].some((p) => c.startsWith(p));
  });
  return { parks, mart, chargers };
}
```

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint lib/amenity.ts`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add lib/amenity.ts
git commit -m "feat(amenity): add nearby apartments/parks and school amenity bundle"
```

---

## Phase 2 — 메뉴 / IA

### Task 7: 네비게이션에 생활인프라 추가

**Files:**
- Modify: `app/(public)/_components/nav.tsx`

`생활권 (Soon)` 버튼을 `생활인프라`(=/life 링크)로 교체. `청약 (Soon)`은 유지.

- [ ] **Step 1: nav.tsx 데스크톱 메뉴 수정**

`<div className="hidden gap-6 ...">` 내부를 다음으로 교체:

```tsx
<Link href="/">홈</Link>
<Link href="/list">실거래가</Link>
<Link href="/life">생활인프라</Link>
<button onClick={() => setSoonOpen('청약')} className="inline-flex items-center gap-1.5">
  청약 <Badge tone="gray">Soon</Badge>
</button>
```

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/_components/nav.tsx"`
Expected: 통과(미사용 import 없도록 확인).

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/_components/nav.tsx"
git commit -m "feat(nav): add 생활인프라 menu, replace 생활권 placeholder"
```

---

### Task 8: 푸터에 생활인프라 카테고리 링크 추가

**Files:**
- Modify: `app/(public)/_components/footer.tsx`

"서비스" 컬럼에 학교 링크 추가, 또는 신규 "생활인프라" 컬럼. 여기서는 "서비스" 컬럼에 추가하고 별도 카테고리 줄을 둔다.

- [ ] **Step 1: footer.tsx의 "서비스" ul 아래에 항목 추가**

```tsx
<li><Link href="/region">지역</Link></li>
<li><Link href="/life">생활인프라</Link></li>
<li><Link href="/school">학교찾기</Link></li>
```

- [ ] **Step 2: 린트·커밋**

Run: `pnpm eslint "app/(public)/_components/footer.tsx"`
```bash
git add "app/(public)/_components/footer.tsx"
git commit -m "feat(footer): add 생활인프라/학교 links"
```

---

### Task 9: /life 생활인프라 허브 페이지

**Files:**
- Create: `app/(public)/life/page.tsx`
- Create: `app/(public)/life/_components/category-card.tsx`

5개 카테고리 카드. 학교만 활성 링크(`/school`), 나머지는 "준비중" 비활성. 스타일은 `html/school-list.html`의 카드 톤 + 기존 `Card` 사용.

- [ ] **Step 1: category-card.tsx 작성**

```tsx
// app/(public)/life/_components/category-card.tsx
import Link from 'next/link';

interface Props {
  emoji: string;
  title: string;
  desc: string;
  href?: string; // 없으면 준비중
}

export function CategoryCard({ emoji, title, desc, href }: Props) {
  const inner = (
    <div className={`flex flex-col items-center gap-2 rounded-[22px] border border-[var(--color-line)] bg-white p-7 text-center shadow-[var(--shadow-soft)] transition ${href ? 'hover:border-[var(--color-sky)] hover:-translate-y-0.5' : 'opacity-60'}`}>
      <span className="text-4xl">{emoji}</span>
      <p className="text-base font-bold text-[var(--color-blue-dark)]">{title}</p>
      <p className="text-xs text-[var(--color-muted)]">{desc}</p>
      {!href && <span className="mt-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">준비중</span>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
```

- [ ] **Step 2: /life/page.tsx 작성**

```tsx
// app/(public)/life/page.tsx
import { CategoryCard } from './_components/category-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '생활인프라 — 학교·공원·마트·충전소',
  description: '아파트 주변 학교, 공원, 마트·편의, 병원·약국, 충전소 등 생활인프라 정보를 한곳에서.',
  alternates: { canonical: '/life' },
};

export const revalidate = 86_400;

const CATEGORIES = [
  { emoji: '🏫', title: '학교찾기', desc: '초·중·고·특수학교', href: '/school' },
  { emoji: '🏥', title: '병원·약국', desc: '준비 중입니다' },
  { emoji: '🛒', title: '마트·편의', desc: '편의점·마트·카페·전통시장' },
  { emoji: '🌳', title: '공원', desc: '근린·체육공원' },
  { emoji: '⚡', title: '충전소', desc: '전기차 충전소 (주차장 예정)' },
];

export default function LifeHubPage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활인프라</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        우리 동네 생활인프라
      </h1>
      <p className="mb-10 text-sm text-[var(--color-muted)]">
        학교부터 시작해 공원·마트·충전소까지 단계적으로 추가합니다.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {CATEGORIES.map((c) => (
          <CategoryCard key={c.title} {...c} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 타입·린트·빌드 확인**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/life/**/*.tsx"`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/life"
git commit -m "feat(life): add 생활인프라 hub page with category cards"
```

---

## Phase 3 — 학교 페이지

### Task 10: /school 허브 (시도별 시군구 그리드)

**Files:**
- Create: `app/(public)/school/page.tsx`

전국 시도→시군구 링크를 한 페이지에. 시군구별 학교 수를 함께 표시. `getSidoList`(level1) + `getSigungusBySido`는 비효율이므로 level-2 전체를 한 번에 가져오는 헬퍼를 lib/region에 추가하거나 기존 함수를 조합한다. 여기서는 `getSchoolCountsBySigungu`(Task 5) + level-2 Region 전체를 사용.

- [ ] **Step 1: lib/region.ts에 level-2 전체 조회 추가**

```ts
// lib/region.ts 에 추가
export async function getAllSigungus() {
  return prisma.region.findMany({
    where: { level: 2, isAbolished: false, sigunguCode: { not: null } },
    select: { sido: true, sigungu: true, sigunguCode: true },
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
}
```

- [ ] **Step 2: /school/page.tsx 작성**

```tsx
// app/(public)/school/page.tsx
import Link from 'next/link';
import { getAllSigungus } from '@/lib/region';
import { getSchoolCountsBySigungu } from '@/lib/school';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '학교찾기 — 전국 시군구별 학교',
  description: '전국 시·군·구별 초·중·고·특수학교를 찾아보세요. 학교 주변 아파트 실거래가까지 한 번에.',
  alternates: { canonical: '/school' },
};

export const revalidate = 86_400;

export default async function SchoolHubPage() {
  const [sigungus, counts] = await Promise.all([
    getAllSigungus().catch(() => []),
    getSchoolCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  // 시도별 그룹핑
  const bySido = new Map<string, typeof sigungus>();
  for (const s of sigungus) {
    if (!s.sigunguCode) continue;
    const arr = bySido.get(s.sido) ?? [];
    arr.push(s);
    bySido.set(s.sido, arr);
  }

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활인프라 · 학교찾기</p>
      <h1 className="mb-8 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">지역별 학교 찾기</h1>
      <div className="flex flex-col gap-8">
        {[...bySido.entries()].map(([sido, list]) => (
          <div key={sido}>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{sido}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {list.map((sg) => (
                <Link
                  key={sg.sigunguCode}
                  href={`/school/${sg.sigunguCode}`}
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

- [ ] **Step 3: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/school/page.tsx" lib/region.ts`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/school/page.tsx" lib/region.ts
git commit -m "feat(school): add 시군구 grid hub page"
```

---

### Task 11: 학교 목록 컴포넌트 (필터·카드·바텀시트)

**Files:**
- Create: `app/(public)/school/[sigunguCode]/_components/school-filter-panel.tsx`
- Create: `app/(public)/school/[sigunguCode]/_components/school-mobile-filter-sheet.tsx`
- Create: `app/(public)/school/[sigunguCode]/_components/school-card.tsx`
- Create: `app/(public)/school/[sigunguCode]/_components/school-pagination.tsx`

`ListFilterPanel`/`MobileFilterSheet`/`PaginationNav`는 `/list` 전용이라 학교용으로 복제·단순화한다. 필터는 학교급/설립/남녀공학/이름. 스타일은 `html/school-list.html` 참조. 기존 `Chip`(active prop), `Badge`, `BottomSheet`, `Pagination` 재사용.

- [ ] **Step 1: school-filter-panel.tsx (client)**

`/school/[sigunguCode]?kind=&found=&coedu=&q=&page=` 쿼리를 갱신. `basePath`로 라우트 주입(목록 페이지·바텀시트 공용).

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/chip';

const KINDS = [['all','전체'],['elem','초등'],['mid','중등'],['high','고등'],['special','특수']] as const;
const FOUNDS = [['all','전체'],['public','국공립'],['private','사립']] as const;
const COEDUS = [['all','전체'],['male','남'],['female','여'],['co','공학']] as const;

interface Props {
  basePath: string; // `/school/${sigunguCode}`
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function SchoolFilterPanel({ basePath, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const get = (k: string, d = 'all') => p.get(k) ?? d;

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) v === null ? next.delete(k) : next.set(k, v);
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">학교명</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder="예) 대청중학교"
          className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-sm"
        />
      </section>
      <FilterGroup title="학교급" k="kind" options={KINDS} get={get} update={update} />
      <FilterGroup title="설립유형" k="found" options={FOUNDS} get={get} update={update} />
      <FilterGroup title="남녀공학" k="coedu" options={COEDUS} get={get} update={update} />
    </div>
  );
}

function FilterGroup({ title, k, options, get, update }: {
  title: string; k: string; options: readonly (readonly [string, string])[];
  get: (k: string) => string; update: (u: Record<string, string | null>) => void;
}) {
  const cur = get(k);
  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([val, label]) => (
          <Chip key={val} active={cur === val} onClick={() => update({ [k]: val === 'all' ? null : val })}>
            {label}
          </Chip>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: school-mobile-filter-sheet.tsx (client)** — `MobileFilterSheet` 패턴 복제, `/list`→`basePath`, 필터 카운트는 kind/found/coedu/q 기준.

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { SchoolFilterPanel } from './school-filter-panel';

export function SchoolMobileFilterSheet({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeCount = ['kind','found','coedu','q'].filter((k) => sp.get(k) && sp.get(k) !== 'all').length;

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
        <SchoolFilterPanel basePath={basePath} params={pending} onParamsChange={setPending} />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: school-card.tsx (server)** — 카드. `html/school-list.html`의 카드 구조 참조. 태그는 `Badge` 사용.

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { School } from '@prisma/client';

export function SchoolCard({ school, basePath }: { school: School; basePath: string }) {
  return (
    <Link href={`${basePath}/${school.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">🏫</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{school.name}</h3>
            {school.schoolKind && <Badge tone="blue">{school.schoolKind}</Badge>}
            {school.foundType && <Badge tone="green">{school.foundType}</Badge>}
            {school.coeduType && <Badge tone="gray">{school.coeduType}</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{school.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

- [ ] **Step 4: school-pagination.tsx (client)** — `PaginationNav` 복제, `basePath` 주입.

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

export function SchoolPagination({ basePath, current, totalPages, totalItems, perPage }: {
  basePath: string; current: number; totalPages: number; totalItems: number; perPage: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <Pagination
      current={current} totalPages={totalPages} totalItems={totalItems} perPage={perPage}
      onChange={(page) => {
        const params = new URLSearchParams(sp.toString());
        params.set('page', String(page));
        router.push(`${basePath}?${params.toString()}`);
      }}
    />
  );
}
```

- [ ] **Step 5: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/school/[sigunguCode]/_components/*.tsx"`
Expected: 통과.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/school/[sigunguCode]/_components"
git commit -m "feat(school): add list filter/card/pagination components"
```

---

### Task 12: /school/[sigunguCode] 목록 페이지

**Files:**
- Create: `app/(public)/school/[sigunguCode]/page.tsx`

`/list/page.tsx` 레이아웃(2컬럼 + 모바일 시트)을 학교용으로. 스타일은 `html/school-list.html`.

- [ ] **Step 1: page.tsx 작성**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSigunguByCode } from '@/lib/region';
import { getSchoolsBySigungu, getSchoolKindCounts, type SchoolKindSlug, type FoundSlug, type CoeduSlug } from '@/lib/school';
import { SchoolFilterPanel } from './_components/school-filter-panel';
import { SchoolMobileFilterSheet } from './_components/school-mobile-filter-sheet';
import { SchoolCard } from './_components/school-card';
import { SchoolPagination } from './_components/school-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode } = await params;
  const r = await getSigunguByCode(sigunguCode).catch(() => null);
  if (!r) return {};
  return {
    title: `${r.fullName} 학교 — 초·중·고·특수`,
    description: `${r.fullName}의 학교 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/school/${sigunguCode}` },
  };
}

export default async function SchoolListPage({ params, searchParams }: Params) {
  const { sigunguCode } = await params;
  const sp = await searchParams;
  const region = await getSigunguByCode(sigunguCode);
  if (!region || !region.sigunguCode) notFound();

  const basePath = `/school/${sigunguCode}`;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const filter = {
    sigunguCode,
    kind: (sp.kind ?? 'all') as SchoolKindSlug,
    found: (sp.found ?? 'all') as FoundSlug,
    coedu: (sp.coedu ?? 'all') as CoeduSlug,
    q: sp.q,
  };

  const [{ rows, total, totalPages, perPage }, kindCounts] = await Promise.all([
    getSchoolsBySigungu(filter, page),
    getSchoolKindCounts(sigunguCode),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활인프라</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">학교찾기 · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} 학교</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {kindCounts.total.toLocaleString('ko-KR')}개 · 학교를 누르면 주변 아파트 실거래가까지 확인할 수 있어요.</p>
      </div>

      <Suspense><SchoolMobileFilterSheet basePath={basePath} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <SchoolFilterPanel basePath={basePath} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 학교</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 학교가 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((s) => <SchoolCard key={String(s.id)} school={s} basePath={basePath} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><SchoolPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/school/[sigunguCode]/page.tsx"`
Expected: 통과.

- [ ] **Step 3: 빌드 스모크(선택, 시간 여유 시)**

Run: `pnpm build` — `/school/[sigunguCode]` 라우트가 빌드되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/school/[sigunguCode]/page.tsx"
git commit -m "feat(school): add 시군구 school list page"
```

---

### Task 13: 네이버 지도 컴포넌트 + 환경변수

**Files:**
- Modify: `lib/env.ts` (스키마에 추가)
- Create: `components/ui/naver-map.tsx`
- Modify: `.env.local` (로컬 키), Vercel 환경변수(운영)

- [ ] **Step 1: env 스키마에 클라이언트 ID 추가**

`lib/env.ts`의 `schema` 객체에 추가(`KAKAO_JS_KEY` 아래):

```ts
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: z.string().optional(),
```

- [ ] **Step 2: NaverMap 컴포넌트(client) 작성**

네이버 지도 JS v3를 `next/script`로 로드하고 단일 마커를 찍는다. 키 미설정 시 좌표 텍스트로 폴백.

```tsx
// components/ui/naver-map.tsx
'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global { interface Window { naver?: any } }

interface Props { lat: number; lng: number; name?: string; height?: number; }

export function NaverMap({ lat, lng, name, height = 260 }: Props) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !ref.current || !window.naver) return;
    const { naver } = window;
    const center = new naver.maps.LatLng(lat, lng);
    const map = new naver.maps.Map(ref.current, { center, zoom: 16 });
    new naver.maps.Marker({ position: center, map, title: name });
  }, [ready, lat, lng, name]);

  if (!clientId) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] text-sm text-[var(--color-muted)]" style={{ height }}>
        지도 준비 중 ({lat.toFixed(5)}, {lng.toFixed(5)})
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={ref} className="overflow-hidden rounded-2xl border border-[var(--color-line)]" style={{ height }} />
    </>
  );
}
```

> **참고:** 네이버 클라우드 플랫폼 콘솔에서 Maps(Dynamic Map) 이용신청 후 발급되는 키를 사용. 신형은 `ncpKeyId`, 구형 키는 `ncpClientId` 파라미터. 발급 키 유형에 맞게 파라미터명 조정. 서비스 URL 등록 필요(localhost 및 운영 도메인).

- [ ] **Step 3: .env.local에 키 추가 + 타입 확인**

`.env.local`에 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=<발급키>` 추가(사용자가 키 발급).
Run: `pnpm tsc --noEmit && pnpm eslint components/ui/naver-map.tsx lib/env.ts`
Expected: 통과. (`any` 사용으로 eslint 경고 시 해당 라인 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 처리)

- [ ] **Step 4: 커밋** (`.env.local`은 커밋 제외)

```bash
git add components/ui/naver-map.tsx lib/env.ts
git commit -m "feat(map): add NaverMap component and client id env"
```

---

### Task 14: 학교 상세 컴포넌트

**Files:**
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/school-hero.tsx`
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx`
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-apartments.tsx`
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx`
- Create: `app/(public)/school/[sigunguCode]/[id]/_components/school-detail-sidebar.tsx`

스타일·구조는 `html/school-detail.html` 참조. 기존 `Card`, `Badge`, `formatBillion` 재사용.

- [ ] **Step 1: school-hero.tsx (server)**

```tsx
import { Badge } from '@/components/ui/badge';
import type { School } from '@prisma/client';

export function SchoolHero({ school }: { school: School }) {
  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">🏫</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{school.name}</h1>
          {school.schoolKind && <Badge tone="blue">{school.schoolKind}</Badge>}
          {school.foundType && <Badge tone="green">{school.foundType}</Badge>}
          {school.coeduType && <Badge tone="gray">{school.coeduType}</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {school.address}</span>
          {school.tel && <span>📞 {school.tel}</span>}
          {school.homepage && <a href={school.homepage} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-blue)]">🔗 홈페이지</a>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: school-info.tsx (server)** — `Card` + 정보 그리드. `id="info"`.

```tsx
import { Card } from '@/components/ui/card';
import type { School } from '@prisma/client';

export function SchoolInfo({ school, regionFullName }: { school: School; regionFullName: string }) {
  const rows: [string, string | null][] = [
    ['학교급', school.schoolKind], ['설립유형', school.foundType],
    ['남녀공학', school.coeduType], ['관할 교육청', school.eduOffice],
    ['전화', school.tel], ['지역', regionFullName],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">학교 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{k}</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">{v ?? '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: nearby-apartments.tsx (server)** — `getNearbyApartments` 결과 렌더, `/apt/[id]` 링크, `id="apt"`. `formatBillion` 사용. 거리 뱃지. 빈 배열이면 null.

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { NearbyApartment } from '@/lib/amenity';

export function NearbyApartments({ items }: { items: NearbyApartment[] }) {
  if (items.length === 0) return null;
  return (
    <Card id="apt">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">🏠 주변 아파트 실거래가 <span className="text-sm font-normal text-[var(--color-muted)]">· 반경 1km</span></h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((a) => (
          <li key={String(a.id)}>
            <Link href={`/apt/${a.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">
                  {a.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{a.distanceMeters}m</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{a.region}{a.builtYear ? ` · ${a.builtYear}년` : ''}{a.households ? ` · ${a.households.toLocaleString('ko-KR')}세대` : ''}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-[var(--color-blue-dark)]">{formatBillion(a.saleLastPrice)}</p>
                {a.jeonseLastDeposit != null && <p className="text-xs text-[var(--color-muted)]">전세 {formatBillion(a.jeonseLastDeposit)}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 4: nearby-amenities.tsx (client, 탭)** — 공원/마트·편의/충전소 탭. `getSchoolNearbyAmenities` 결과를 props로 받아 클라이언트에서 탭 전환. `id="poi"`.

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyPark, NearbyStore, NearbyEvCharger } from '@/lib/amenity';

interface Props { parks: NearbyPark[]; mart: NearbyStore[]; chargers: NearbyEvCharger[]; }
type Tab = 'park' | 'mart' | 'charger';

export function NearbyAmenities({ parks, mart, chargers }: Props) {
  const [tab, setTab] = useState<Tab>('park');
  const tabs: { key: Tab; label: string; icon: string; items: { id: bigint; name: string; sub: string; dist: number }[] }[] = [
    { key: 'park', label: '공원', icon: '🌳', items: parks.map((p) => ({ id: p.id, name: p.name, sub: p.parkType ?? '공원', dist: p.distanceMeters })) },
    { key: 'mart', label: '마트·편의', icon: '🛒', items: mart.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '', dist: s.distanceMeters })) },
    { key: 'charger', label: '충전소', icon: '⚡', items: chargers.map((c) => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, dist: c.distanceMeters })) },
  ];
  const active = tabs.find((t) => t.key === tab)!;
  return (
    <Card id="poi">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 생활 인프라</h2>
      <div className="mb-3 flex gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] bg-white text-[var(--color-muted)]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {active.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted)]">반경 내 {active.label} 정보가 없습니다.</p>
      ) : (
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
      )}
    </Card>
  );
}
```

- [ ] **Step 5: school-detail-sidebar.tsx (server)** — `DetailSidebar` 패턴: 목차 앵커 + 같은 시군구 다른 학교 + 광고.

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { School } from '@prisma/client';

const ANCHORS = [
  { href: '#info', label: '학교 정보' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
  { href: '#poi', label: '주변 생활 인프라' },
];

export function SchoolDetailSidebar({ basePath, others }: { basePath: string; others: School[] }) {
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
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 학교</h3>
          <ul className="flex flex-col gap-2">
            {others.map((s) => <li key={String(s.id)}><Link href={`${basePath}/${s.id}`} className="text-sm hover:text-[var(--color-blue)]">· {s.name}</Link></li>)}
            <li><Link href={basePath} className="text-sm font-semibold text-[var(--color-blue)]">지역 학교 전체 보기 →</Link></li>
          </ul>
        </Card>
      )}
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
    </div>
  );
}
```

- [ ] **Step 6: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/school/[sigunguCode]/[id]/_components/*.tsx"`
Expected: 통과.

- [ ] **Step 7: 커밋**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/_components"
git commit -m "feat(school): add detail page components"
```

---

### Task 15: /school/[sigunguCode]/[id] 상세 페이지

**Files:**
- Create: `app/(public)/school/[sigunguCode]/[id]/page.tsx`

`/apt/[id]/page.tsx` 구조를 따른다. 학교 location으로 주변 아파트·인프라 병렬 조회. location이 null이면 해당 섹션 생략.

- [ ] **Step 1: page.tsx 작성**

학교 좌표는 `geography`라 Prisma 모델에 없으므로 raw 쿼리로 lat/lng를 별도 조회한다.

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSchoolById, getSchoolsBySigungu } from '@/lib/school';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyApartments, getNearbyParks, getNearbyStores, getNearbyEvChargers } from '@/lib/amenity';
import { SchoolHero } from './_components/school-hero';
import { SchoolInfo } from './_components/school-info';
import { NearbyApartments } from './_components/nearby-apartments';
import { NearbyAmenities } from './_components/nearby-amenities';
import { SchoolDetailSidebar } from './_components/school-detail-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

async function getSchoolLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "School" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  const school = await getSchoolById(BigInt(id)).catch(() => null);
  if (!school) return {};
  return {
    title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
    description: `${school.name}(${school.address}) 학교 정보와 주변 아파트 실거래가.`,
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
}

export default async function SchoolDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const schoolId = BigInt(id);
  const [school, region] = await Promise.all([
    getSchoolById(schoolId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!school || !region || school.sigunguCode !== sigunguCode) notFound();

  const basePath = `/school/${sigunguCode}`;
  const coord = await getSchoolLatLng(schoolId);

  const [apts, parks, stores, chargers, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyParks(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyStores(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyEvChargers(coord.lat, coord.lng) : Promise.resolve([]),
    getSchoolsBySigungu({ sigunguCode }, 1),
  ]);

  const mart = stores.filter((s) => ['G20405', 'G20404', 'G20402', 'I21201'].some((p) => (s.industryCode ?? '').startsWith(p)));
  const others = otherList.rows.filter((s) => s.id !== school.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활인프라</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <Link href={basePath}>{region.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{school.name}</span>
      </nav>

      <SchoolHero school={school} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <SchoolInfo school={school} regionFullName={region.fullName} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={school.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyAmenities parks={parks} mart={mart} chargers={chargers} />}
        </main>
        <aside><SchoolDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입·린트**

Run: `pnpm tsc --noEmit && pnpm eslint "app/(public)/school/[sigunguCode]/[id]/page.tsx"`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(school): add school detail page"
```

---

## Phase 4 — 마무리 & 검증

### Task 16: sitemap 반영

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: 현재 sitemap.ts 확인 후 학교 경로 추가**

`/life`, `/school`(허브)와 시군구 목록 URL(`getAllSigungus()`로 252개)을 추가. **학교 상세 12k URL은 sitemap에서 제외**(분량 과다, 시군구 페이지 내부링크로 색인 유도).

```ts
// app/sitemap.ts — sigungu 학교 목록 추가 예시
import { getAllSigungus } from '@/lib/region';
// ...
const sigungus = await getAllSigungus().catch(() => []);
const schoolEntries = sigungus
  .filter((s) => s.sigunguCode)
  .map((s) => ({ url: `${base}/school/${s.sigunguCode}`, changeFrequency: 'weekly' as const, priority: 0.5 }));
// 기존 entries 배열에 { url: `${base}/life` }, { url: `${base}/school` }, ...schoolEntries 병합
```

- [ ] **Step 2: 타입·린트·커밋**

Run: `pnpm tsc --noEmit && pnpm eslint app/sitemap.ts`
```bash
git add app/sitemap.ts
git commit -m "feat(seo): add school pages to sitemap"
```

---

### Task 17: 전체 검증

- [ ] **Step 1: 전체 단위테스트**

Run: `pnpm test:unit`
Expected: 신규 테스트 포함 전부 PASS.

- [ ] **Step 2: 타입·린트 전체**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 통과.

- [ ] **Step 3: 프로덕션 빌드**

Run: `pnpm build`
Expected: `/life`, `/school`, `/school/[sigunguCode]`, `/school/[sigunguCode]/[id]` 라우트가 모두 빌드됨. 에러 0.

- [ ] **Step 4: 로컬 수동 확인(dev)**

Run: `pnpm dev` 후 브라우저로:
- `/life` 카드 5종(학교만 활성)
- `/school` 시도별 시군구 그리드 → 시군구 클릭
- `/school/[code]` 목록·필터(데스크톱 사이드바 + 모바일 "필터" 바텀시트), 페이지네이션
- `/school/[code]/[id]` 상세: 정보·네이버 지도·주변 아파트(→/apt 링크)·주변 인프라 탭
- 모바일 뷰포트(개발자도구)에서 필터 바텀시트·1컬럼 레이아웃 확인

- [ ] **Step 5: 최종 커밋(있으면)**

```bash
git add -A
git commit -m "chore(school): final verification fixes"
```

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** IA/메뉴(Task 7-9), 라우팅(Task 10/12/15), 데이터 준비(Task 1-3), 목록(Task 11-12), 상세(Task 13-15), 모바일(Task 11 바텀시트 + Task 12/15 반응형 레이아웃), lib(Task 4-6), 렌더링 ISR(각 page revalidate), 지도 네이버(Task 13), 병원·약국 제외(Task 6/14에서 mart만 노출) — 모두 매핑됨.
- **플레이스홀더:** 없음. NEIS schoolKind 특수학교 실제 표기·네이버 키 파라미터명은 실행 단계 확인 항목으로 명시(추정 아님).
- **타입 일관성:** `buildSchoolWhere`/`SchoolFilter`/슬러그 타입, `getNearbyApartments`/`NearbyApartment`, `getSchoolNearbyAmenities` 반환(`parks/mart/chargers`)이 상세 페이지·컴포넌트 props와 일치.
- **주의(실행 시):** Task 5의 `KIND_MAP.special`과 `foundType`/`coeduType` 매핑은 백필 후 distinct 값으로 검증 필요. 네이버 지도 키 발급·서비스URL 등록은 사용자 작업.
