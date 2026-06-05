# 오늘의 부동산 한입 브리핑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 페이지 검색 필터 아래·주변 인프라 위에 실데이터 기반 "오늘의 부동산 한입 브리핑" 섹션(오늘의 실거래 한눈에 · 인기 동네 TOP5 · 거래량 급증 동네)을 추가한다.

**Architecture:** `Transaction`에 `createdAt`(수집일) 컬럼을 추가해 "오늘 새로 수집된 매매"를 식별한다. `lib/briefing.ts`가 순수 헬퍼(시간창·평형 버킷·해시태그)와 DB 집계(`getMarketBriefing`)를 제공하고, 서버 컴포넌트 `MarketBriefing`이 메인 페이지 ISR(1시간)로 캐시된 결과를 렌더한다. 데이터 0건이면 섹션 미렌더.

**Tech Stack:** Next.js(App Router, RSC) · Prisma(PostgreSQL) · TypeScript · Vitest · Tailwind CSS

**참고 문서:** 스펙 `docs/superpowers/specs/2026-06-05-market-briefing-design.md`, 목업 `docs/superpowers/mockups/market-briefing-mock.html`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` (수정) | `Transaction.createdAt` 필드 + 인덱스 추가 |
| `prisma/migrations/20260605010000_add_transaction_created_at/migration.sql` (생성) | 컬럼 추가 · 기존 행 백필 · default/not null · 인덱스 |
| `lib/briefing.ts` (생성) | 타입, 순수 헬퍼(KST 시간창·평형 버킷·지역 라벨·해시태그), DB 집계 `getMarketBriefing()` |
| `tests/lib/briefing.test.ts` (생성) | 순수 헬퍼 단위 테스트 + `getMarketBriefing` 통합 테스트(시드) |
| `app/(public)/_components/market-briefing.tsx` (생성) | 브리핑 서버 컴포넌트(3카드 + 해시태그) |
| `app/(public)/page.tsx` (수정) | `getMarketBriefing()` 호출 + 컴포넌트 렌더 |

**규칙 (프로젝트):** 검증 DB는 `.env.test`(로컬 docker). 테스트는 `pnpm test:unit`이 `dotenv -e .env.test`로 실행. 마이그레이션은 손으로 쓴 `migration.sql`을 `prisma migrate deploy`로 적용.

---

## Task 1: `Transaction.createdAt` 컬럼 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (model Transaction, 107–150행 구간)
- Create: `prisma/migrations/20260605010000_add_transaction_created_at/migration.sql`

- [ ] **Step 1: 스키마에 createdAt + 인덱스 추가**

`prisma/schema.prisma`의 `model Transaction`에서 `rawHash` 라인 바로 뒤(`@@unique` 위)에 필드를 추가하고, 인덱스 블록에 한 줄 추가한다.

`rawHash         String  @db.Char(64)` 다음 줄에:
```prisma
  createdAt    DateTime @default(now())
```
그리고 인덱스 블록(`@@index([propertyType, contractDate(sort: Desc)])` 다음)에:
```prisma
  @@index([dealType, createdAt(sort: Desc)])
```

- [ ] **Step 2: 마이그레이션 SQL 작성**

`prisma/migrations/20260605010000_add_transaction_created_at/migration.sql`:
```sql
-- AlterTable: createdAt 추가(우선 nullable로 추가 후 백필)
ALTER TABLE "Transaction" ADD COLUMN "createdAt" TIMESTAMP(3);

-- 기존 행 백필: 신고일(없으면 계약일)을 수집일 프록시로. 배포 첫날 왜곡 방지.
UPDATE "Transaction" SET "createdAt" = COALESCE("registerDate", "contractDate") WHERE "createdAt" IS NULL;

-- 신규 행은 INSERT 시각으로 자동 기록
ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Transaction_dealType_createdAt_idx" ON "Transaction"("dealType", "createdAt" DESC);
```

- [ ] **Step 3: 테스트 DB에 마이그레이션 적용 + 클라이언트 생성**

Run: `pnpm test:db:migrate && pnpm prisma generate`
Expected: `add_transaction_created_at` 적용 성공, `prisma generate` 완료. 에러 없음.

- [ ] **Step 4: 컬럼 존재 확인**

Run: `pnpm dlx tsx -e "import {prisma} from './lib/db'; prisma.transaction.findFirst({select:{id:true,createdAt:true}}).then(r=>{console.log('createdAt 타입 OK', r);process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"`
(또는 `.env.test` 로딩: `pnpm dlx dotenv -e .env.test -- tsx -e "..."`)
Expected: 에러 없이 종료(테이블이 비어 `null`이어도 통과 — 타입이 컴파일되면 성공).

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260605010000_add_transaction_created_at/
git commit -m "feat(tx): Transaction.createdAt 수집일 컬럼·인덱스 추가"
```

---

## Task 2: `lib/briefing.ts` 순수 헬퍼 + 타입 (TDD, DB 불필요)

**Files:**
- Create: `lib/briefing.ts`
- Test: `tests/lib/briefing.test.ts`

이 태스크는 DB 없이 동작하는 순수 함수만 다룬다: KST 시간창 계산, 평형 버킷, 지역 라벨, 해시태그.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/briefing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  kstDayStartUtc,
  contractDateWindows,
  areaBandLabel,
  regionLabel,
  buildHashtags,
} from '@/lib/briefing';

describe('kstDayStartUtc', () => {
  it('KST 자정의 UTC 시각(전날 15:00Z)을 반환', () => {
    // 2026-06-05 02:00 KST = 2026-06-04 17:00Z
    const now = new Date('2026-06-04T17:00:00.000Z');
    expect(kstDayStartUtc(now).toISOString()).toBe('2026-06-04T15:00:00.000Z');
  });
});

describe('contractDateWindows', () => {
  it('최근 30일/직전 30일 경계를 KST 날짜로 반환', () => {
    const now = new Date('2026-06-05T00:00:00.000Z'); // 2026-06-05 09:00 KST
    const w = contractDateWindows(now);
    expect(w.recentStart.toISOString().slice(0, 10)).toBe('2026-05-07');
    expect(w.prevStart.toISOString().slice(0, 10)).toBe('2026-04-07');
    expect(w.recentStart > w.prevStart).toBe(true);
  });
});

describe('areaBandLabel', () => {
  it('전용면적 구간을 라벨로 매핑', () => {
    expect(areaBandLabel(45)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(59.99)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(84.9)).toBe('전용 60~85㎡');
    expect(areaBandLabel(101)).toBe('전용 85~102㎡');
    expect(areaBandLabel(120)).toBe('전용 102~135㎡');
    expect(areaBandLabel(140)).toBe('전용 135㎡ 초과');
  });
});

describe('regionLabel', () => {
  it('fullName에서 시·도 토큰을 제거해 시군구 라벨 생성', () => {
    expect(regionLabel('경기도 화성시')).toBe('화성시');
    expect(regionLabel('경기도 수원시 영통구')).toBe('수원시 영통구');
    expect(regionLabel('서울특별시 강남구')).toBe('강남구');
    expect(regionLabel('세종특별자치시')).toBe('세종특별자치시'); // 단일 토큰은 그대로
  });
});

describe('buildHashtags', () => {
  it('데이터에서 해시태그 칩 문자열을 생성', () => {
    const tags = buildHashtags({
      txCount: 2431,
      topRegionLabel: '화성시',
      topAreaLabel: '전용 60~85㎡',
      highestRegionLabel: '강남구',
    });
    expect(tags).toContain('#오늘의실거래');
    expect(tags).toContain('#매매 2,431건');
    expect(tags).toContain('#최고가 강남구');
    expect(tags).toContain('#화성시');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm dlx dotenv -e .env.test -- vitest run tests/lib/briefing.test.ts`
Expected: FAIL — `@/lib/briefing` 모듈/함수 미존재.

- [ ] **Step 3: 최소 구현**

`lib/briefing.ts` (헬퍼 + 타입만; DB 함수는 Task 3):
```ts
import { prisma } from '@/lib/db';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각이 속한 KST '오늘'의 자정을 UTC Date로 반환. */
export function kstDayStartUtc(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST 자정 = 해당 KST 날짜 00:00에서 KST_OFFSET을 빼면 UTC
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}

/** 급증 동네용 계약일 윈도우(최근 30일 / 직전 30일)의 KST 날짜 경계. */
export function contractDateWindows(now: Date): {
  recentStart: Date; // 최근 30일 시작(포함)
  prevStart: Date; // 직전 30일 시작(포함)
  prevEnd: Date; // 직전 30일 끝(= recentStart, 미포함)
} {
  const todayStart = kstDayStartUtc(now);
  const day = 24 * 60 * 60 * 1000;
  const recentStart = new Date(todayStart.getTime() - 29 * day);
  const prevStart = new Date(todayStart.getTime() - 59 * day);
  return { recentStart, prevStart, prevEnd: recentStart };
}

const AREA_BANDS: { max: number; label: string }[] = [
  { max: 60, label: '전용 60㎡ 미만' }, // 예측 술어가 strict `<` 60이므로 "미만"으로 표기(리뷰 반영)
  { max: 85, label: '전용 60~85㎡' },
  { max: 102, label: '전용 85~102㎡' },
  { max: 135, label: '전용 102~135㎡' },
  { max: Infinity, label: '전용 135㎡ 초과' },
];

export function areaBandLabel(sqm: number): string {
  return AREA_BANDS.find((b) => sqm < b.max)!.label;
}

/** "경기도 수원시 영통구" → "수원시 영통구" (시·도 토큰 제거). 단일 토큰은 그대로. */
export function regionLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
}

export function buildHashtags(input: {
  txCount: number;
  topRegionLabel: string | null;
  topAreaLabel: string | null;
  highestRegionLabel: string | null;
}): string[] {
  const tags = ['#오늘의실거래', `#매매 ${input.txCount.toLocaleString('ko-KR')}건`];
  if (input.highestRegionLabel) tags.push(`#최고가 ${input.highestRegionLabel}`);
  if (input.topAreaLabel) tags.push(`#${input.topAreaLabel.replace(/\s/g, '')} 최다`);
  if (input.topRegionLabel) tags.push(`#${input.topRegionLabel}`);
  return tags;
}

// ---- 타입 (Task 3에서 사용) ----
export interface TxHighlight {
  propertyId: string;
  propertyName: string;
  regionLabel: string;
  amountManwon: number;
}
export interface RegionCount {
  code: string;
  label: string;
  count: number;
}
export interface SurgeRegion {
  code: string;
  label: string;
  recent: number;
  prev: number;
  changePct: number;
}
export interface MarketBriefing {
  refDate: string;
  isFallback: boolean;
  summary: {
    txCount: number;
    highest: TxHighlight | null;
    lowest: TxHighlight | null;
    topRegion: RegionCount | null;
    topAreaBand: { label: string; count: number } | null;
  };
  popularRegions: RegionCount[];
  surgeRegions: SurgeRegion[];
  hashtags: string[];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm dlx dotenv -e .env.test -- vitest run tests/lib/briefing.test.ts`
Expected: PASS (5 describe 블록 통과).

- [ ] **Step 5: Commit**
```bash
git add lib/briefing.ts tests/lib/briefing.test.ts
git commit -m "feat(briefing): 시간창·평형버킷·해시태그 순수 헬퍼 + 타입"
```

---

## Task 3: `getMarketBriefing()` DB 집계 (TDD, 시드 DB)

**Files:**
- Modify: `lib/briefing.ts` (`getMarketBriefing` 추가)
- Modify: `tests/lib/briefing.test.ts` (통합 테스트 describe 추가)

매매(SALE)만 대상. 요약/인기동네는 수집일(`createdAt`) 창, 급증은 계약일(`contractDate`) 창.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`tests/lib/briefing.test.ts` 상단 import에 추가:
```ts
import { beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getMarketBriefing } from '@/lib/briefing';
```

파일 끝에 통합 블록 추가:
```ts
const SGG_HOT = '99901'; // 거래 많은 시군구
const SGG_LOW = '99902';
const RC_HOT = '9990100000';
const RC_LOW = '9990200000';
let hotPropId: bigint;
let lowPropId: bigint;
const NOW = new Date(); // createdAt = now()로 들어가므로 '오늘' 창에 잡힘

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: RC_HOT },
    update: {},
    create: { code: RC_HOT, sido: '경기', sigungu: '시드시', fullName: '경기도 시드시', sigunguCode: SGG_HOT, level: 2, sourceVersion: 'test' },
  });
  await prisma.region.upsert({
    where: { code: RC_LOW },
    update: {},
    create: { code: RC_LOW, sido: '전남', sigungu: '저가군', fullName: '전라남도 저가군', sigunguCode: SGG_LOW, level: 2, sourceVersion: 'test' },
  });
  const hot = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: '시드아파트', nameNorm: '시드아파트', regionCode: RC_HOT, address: '경기도 시드시 1' } });
  const low = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: '저가아파트', nameNorm: '저가아파트', regionCode: RC_LOW, address: '전라남도 저가군 1' } });
  hotPropId = hot.id;
  lowPropId = low.id;

  const base = (over: Record<string, unknown>, key: string) => ({
    propertyType: PropertyType.APARTMENT,
    dealType: DealType.SALE,
    contractDate: new Date(),
    exclusiveArea: 84.5, // → '전용 60~85㎡'
    source: 'test',
    rawHash: createHash('sha256').update(`brief-${key}`).digest('hex'),
    ...over,
  });

  // 시드시: 매매 3건(고가 542000만원=54.2억 포함), 저가군: 1건(2100만원)
  await prisma.transaction.createMany({
    data: [
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 542_000 }, 'h1') as any,
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 100_000 }, 'h2') as any,
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 120_000 }, 'h3') as any,
      base({ propertyId: lowPropId, regionCode: RC_LOW, sigunguCode: SGG_LOW, dealAmount: 2_100 }, 'l1') as any,
    ],
  });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { sigunguCode: { in: [SGG_HOT, SGG_LOW] } } });
  await prisma.property.deleteMany({ where: { id: { in: [hotPropId, lowPropId] } } });
  await prisma.region.deleteMany({ where: { code: { in: [RC_HOT, RC_LOW] } } });
  await prisma.$disconnect();
});

describe('getMarketBriefing 집계', () => {
  it('오늘 수집된 매매를 집계하고 최고가/최저가/최다지역을 반환', async () => {
    const b = await getMarketBriefing(NOW);
    expect(b).not.toBeNull();
    expect(b!.summary.txCount).toBeGreaterThanOrEqual(4);
    expect(b!.summary.highest?.amountManwon).toBe(542_000);
    expect(b!.summary.highest?.regionLabel).toBe('시드시');
    expect(b!.summary.lowest?.amountManwon).toBe(2_100);
    expect(b!.summary.topRegion?.label).toBe('시드시');
    expect(b!.summary.topAreaBand?.label).toBe('전용 60~85㎡');
    expect(b!.popularRegions.some((r) => r.label === '시드시')).toBe(true);
    expect(b!.hashtags).toContain('#오늘의실거래');
  });
});
```

> 주의: 위 테스트는 운영 시드 외 다른 데이터가 같은 날 `createdAt`에 있어도 동작하도록 `toBeGreaterThanOrEqual`/`some`을 쓴다. 단, `highest`는 전국 최고가라 다른 데이터가 542,000만원보다 크면 깨질 수 있음 — 로컬 docker(`.env.test`)는 비어 있다는 전제(프로젝트 검증 DB 규칙). 만약 시드 외 데이터가 있다면 테스트 시군구로 한정하는 인자를 추가하기보다, 빈 테스트 DB에서 실행한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm dlx dotenv -e .env.test -- vitest run tests/lib/briefing.test.ts -t "getMarketBriefing"`
Expected: FAIL — `getMarketBriefing` 미존재.

- [ ] **Step 3: `getMarketBriefing` 구현**

`lib/briefing.ts` 끝에 추가:
```ts
import { DealType, Prisma } from '@prisma/client';
import { formatDate } from '@/lib/format';

const SURGE_MIN_RECENT = 30; // 급증 후보 최소 최근거래 건수(노이즈 필터)

/** sigunguCode 집합 → { sigunguCode: {code, label} } 매핑 */
async function resolveRegions(codes: string[]): Promise<Map<string, { code: string; label: string }>> {
  const rows = await prisma.region.findMany({
    where: { sigunguCode: { in: codes }, level: 2 },
    select: { sigunguCode: true, code: true, fullName: true },
  });
  const map = new Map<string, { code: string; label: string }>();
  for (const r of rows) {
    if (r.sigunguCode) map.set(r.sigunguCode, { code: r.code, label: regionLabel(r.fullName) });
  }
  return map;
}

export async function getMarketBriefing(now: Date = new Date()): Promise<MarketBriefing | null> {
  // 1) 수집일 창 결정: 오늘(KST) createdAt 이상. 0건이면 최신 createdAt 날짜로 폴백.
  let start = kstDayStartUtc(now);
  let isFallback = false;
  const saleWhere = (gte: Date): Prisma.TransactionWhereInput => ({ dealType: DealType.SALE, createdAt: { gte } });

  let txCount = await prisma.transaction.count({ where: saleWhere(start) });
  let refDate = formatDate(start);
  if (txCount === 0) {
    const latest = await prisma.transaction.findFirst({
      where: { dealType: DealType.SALE },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return null;
    start = kstDayStartUtc(latest.createdAt);
    isFallback = true;
    txCount = await prisma.transaction.count({ where: saleWhere(start) });
    refDate = formatDate(start);
    if (txCount === 0) return null;
  }
  const where = saleWhere(start);

  // 2) 요약: 최고가/최저가/최다지역/최다평형 + 인기동네
  const [highestRow, lowestRow, regionGroups, areaBandCounts] = await Promise.all([
    prisma.transaction.findFirst({
      where: { ...where, dealAmount: { not: null } },
      orderBy: { dealAmount: 'desc' },
      select: { propertyId: true, dealAmount: true, sigunguCode: true, property: { select: { name: true } } },
    }),
    prisma.transaction.findFirst({
      where: { ...where, dealAmount: { gt: 0 } },
      orderBy: { dealAmount: 'asc' },
      select: { propertyId: true, dealAmount: true, sigunguCode: true, property: { select: { name: true } } },
    }),
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where,
      _count: { _all: true },
      orderBy: { _count: { sigunguCode: 'desc' } },
      take: 5,
    }),
    Promise.all(
      AREA_BANDS.map(async (band, i) => {
        const min = i === 0 ? 0 : AREA_BANDS[i - 1].max;
        const count = await prisma.transaction.count({
          where: { ...where, exclusiveArea: { gte: new Prisma.Decimal(min), lt: band.max === Infinity ? undefined : new Prisma.Decimal(band.max) } },
        });
        return { label: band.label, count };
      }),
    ),
  ]);

  // 3) 급증 동네: 계약일 창 비교
  const { recentStart, prevStart, prevEnd } = contractDateWindows(now);
  const [recentGroups, prevGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where: { dealType: DealType.SALE, contractDate: { gte: recentStart } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where: { dealType: DealType.SALE, contractDate: { gte: prevStart, lt: prevEnd } },
      _count: { _all: true },
    }),
  ]);

  // 4) 지역 라벨 일괄 해석
  const allCodes = new Set<string>();
  if (highestRow) allCodes.add(highestRow.sigunguCode);
  if (lowestRow) allCodes.add(lowestRow.sigunguCode);
  regionGroups.forEach((g) => allCodes.add(g.sigunguCode));
  recentGroups.forEach((g) => allCodes.add(g.sigunguCode));
  const regionMap = await resolveRegions(Array.from(allCodes));
  const labelOf = (sgg: string) => regionMap.get(sgg)?.label ?? sgg;
  const codeOf = (sgg: string) => regionMap.get(sgg)?.code ?? sgg;

  // 5) 조립
  const topAreaBand = areaBandCounts.reduce((a, b) => (b.count > a.count ? b : a));
  const popularRegions: RegionCount[] = regionGroups.map((g) => ({
    code: codeOf(g.sigunguCode),
    label: labelOf(g.sigunguCode),
    count: g._count._all,
  }));
  const topRegion = popularRegions[0] ?? null;

  const prevMap = new Map(prevGroups.map((g) => [g.sigunguCode, g._count._all]));
  const surgeRegions: SurgeRegion[] = recentGroups
    .filter((g) => g._count._all >= SURGE_MIN_RECENT)
    .map((g) => {
      const recent = g._count._all;
      const prev = prevMap.get(g.sigunguCode) ?? 0;
      const changePct = prev === 0 ? 100 : Math.round(((recent - prev) / prev) * 100);
      return { code: codeOf(g.sigunguCode), label: labelOf(g.sigunguCode), recent, prev, changePct };
    })
    .filter((s) => s.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 3);

  const highest: TxHighlight | null = highestRow
    ? { propertyId: String(highestRow.propertyId), propertyName: highestRow.property.name, regionLabel: labelOf(highestRow.sigunguCode), amountManwon: highestRow.dealAmount! }
    : null;
  const lowest: TxHighlight | null = lowestRow
    ? { propertyId: String(lowestRow.propertyId), propertyName: lowestRow.property.name, regionLabel: labelOf(lowestRow.sigunguCode), amountManwon: lowestRow.dealAmount! }
    : null;

  const hashtags = buildHashtags({
    txCount,
    topRegionLabel: topRegion?.label ?? null,
    topAreaLabel: topAreaBand.count > 0 ? topAreaBand.label : null,
    highestRegionLabel: highest?.regionLabel ?? null,
  });

  return {
    refDate,
    isFallback,
    summary: { txCount, highest, lowest, topRegion, topAreaBand: topAreaBand.count > 0 ? topAreaBand : null },
    popularRegions,
    surgeRegions,
    hashtags,
  };
}
```

> 참고: `groupBy.orderBy: { _count: { sigunguCode: 'desc' } }`는 Prisma에서 해당 컬럼 기준 카운트 정렬이다. `_count: { _all: true }`로 건수를 받는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm dlx dotenv -e .env.test -- vitest run tests/lib/briefing.test.ts`
Expected: PASS (순수 헬퍼 + getMarketBriefing 통합 모두 통과).

- [ ] **Step 5: Commit**
```bash
git add lib/briefing.ts tests/lib/briefing.test.ts
git commit -m "feat(briefing): getMarketBriefing 매매 집계(요약·인기동네·급증) 구현"
```

---

## Task 4: `MarketBriefing` 컴포넌트 + 메인 페이지 연결

**Files:**
- Create: `app/(public)/_components/market-briefing.tsx`
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: 서버 컴포넌트 작성**

`app/(public)/_components/market-briefing.tsx`:
```tsx
import Link from 'next/link';
import { formatBillion } from '@/lib/format';
import type { MarketBriefing } from '@/lib/briefing';

export function MarketBriefing({ briefing }: { briefing: MarketBriefing | null }) {
  if (!briefing) return null;
  const { summary, popularRegions, surgeRegions, hashtags, refDate } = briefing;
  const maxCount = popularRegions[0]?.count ?? 1;
  const [, mm, dd] = refDate.split('-');

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-xl font-black tracking-tight md:text-[22px]">📈 오늘의 부동산 한입 브리핑</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {Number(mm)}월 {Number(dd)}일 수집 기준 · 매매
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {hashtags.map((t) => (
          <span key={t} className="rounded-full border border-[var(--color-line)] bg-[var(--color-sky-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-blue)]">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 카드1: 오늘의 실거래 한눈에 */}
        <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)] md:col-span-2">
          <h3 className="mb-3.5 text-[15px] font-extrabold tracking-tight">
            오늘 시장에서 무슨 일이 <span className="text-[var(--color-blue)]">있었나</span>
          </h3>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--color-line)] md:grid-cols-5">
            <Tile k="🧾 오늘 등록된 실거래" v={`${summary.txCount.toLocaleString('ko-KR')}건`} sub="전국 매매 신고분" />
            {summary.highest && (
              <Tile k="🔥 최고가 거래" v={formatBillion(summary.highest.amountManwon)} sub={`${summary.highest.regionLabel} · ${summary.highest.propertyName}`} href={`/apt/${summary.highest.propertyId}`} />
            )}
            {summary.lowest && (
              <Tile k="📉 최저가 거래" v={formatBillion(summary.lowest.amountManwon)} sub={`${summary.lowest.regionLabel} · ${summary.lowest.propertyName}`} href={`/apt/${summary.lowest.propertyId}`} />
            )}
            {summary.topRegion && (
              <Tile k="🚀 가장 많이 거래된 지역" v={summary.topRegion.label} sub={`${summary.topRegion.count}건`} href={`/region/${summary.topRegion.code}`} />
            )}
            {summary.topAreaBand && <Tile k="💡 최다 거래 평형" v={summary.topAreaBand.label.replace('전용 ', '')} sub="전용면적 기준" />}
          </div>
        </section>

        {/* 카드2: 인기 동네 TOP5 */}
        {popularRegions.length > 0 && (
          <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <h3 className="mb-3.5 text-[15px] font-extrabold tracking-tight">
              오늘 가장 <span className="text-[var(--color-blue)]">인기있는 동네</span>
            </h3>
            <ul>
              {popularRegions.map((r, i) => (
                <li key={r.code} className="flex items-center gap-3 border-b border-dashed border-[var(--color-line)] py-2.5 last:border-0">
                  <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-xs font-black ${i === 0 ? 'bg-[var(--color-blue)] text-white' : 'bg-[var(--color-soft)] text-[var(--color-blue-dark)]'}`}>{i + 1}</span>
                  <Link href={`/region/${r.code}`} className="w-[88px] flex-none text-sm font-bold hover:underline">{r.label}</Link>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-sky-soft)]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[var(--color-blue)] to-[var(--color-sky)]" style={{ width: `${Math.max(8, (r.count / maxCount) * 100)}%` }} />
                  </span>
                  <span className="w-12 text-right text-[13px] font-extrabold text-[var(--color-blue-dark)]">{r.count}건</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 카드3: 거래량 급증 동네 */}
        {surgeRegions.length > 0 && (
          <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <h3 className="mb-2 text-[15px] font-extrabold tracking-tight">오늘의 <span className="text-[var(--color-blue)]">발견</span></h3>
            <p className="mb-3 text-xs text-[var(--color-muted)]">최근 30일 거래량이 직전 30일보다 급증한 지역</p>
            <ul>
              {surgeRegions.map((s) => (
                <li key={s.code} className="flex items-center justify-between border-b border-dashed border-[var(--color-line)] py-2.5 last:border-0">
                  <Link href={`/region/${s.code}`} className="text-sm font-bold hover:underline">
                    📍 {s.label}
                    <small className="mt-0.5 block font-medium text-[var(--color-muted)]">최근 30일 {s.recent}건 (직전 {s.prev}건)</small>
                  </Link>
                  <span className="rounded-full bg-[#e8f8f1] px-2.5 py-1 text-[15px] font-black text-[var(--color-green)]">+{s.changePct}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

function Tile({ k, v, sub, href }: { k: string; v: string; sub: string; href?: string }) {
  const body = (
    <div className="h-full bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">{k}</div>
      <div className={`mt-1.5 text-[22px] font-black leading-tight tracking-tight ${href ? 'text-[var(--color-blue)]' : 'text-[var(--color-blue-dark)]'}`}>{v}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
```

- [ ] **Step 2: 메인 페이지에 연결**

`app/(public)/page.tsx` 수정:
1. import 추가(다른 `_components` import 옆):
```tsx
import { MarketBriefing } from './_components/market-briefing';
import { getMarketBriefing } from '@/lib/briefing';
```
2. `Promise.all` 호출 변경:
```tsx
  const [sidoList, stats, briefing] = await Promise.all([getSidoList(), getHomeStats(), getMarketBriefing()]);
```
3. 검색 필터 행 `</div>`(현재 32행)와 `<AmenityHub />`(34행) 사이에 렌더:
```tsx
      </div>

      <MarketBriefing briefing={briefing} />

      <AmenityHub />
```

- [ ] **Step 3: 타입체크 + 빌드 확인**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

Run: `pnpm test:unit`
Expected: 기존 + briefing 테스트 모두 PASS.

- [ ] **Step 4: 화면 확인(수동/스크린샷)**

Run: `pnpm build && pnpm start` 후 `http://localhost:3000/` 접속, 또는 dev 서버.
Expected: 검색 필터 아래·주변 인프라 위에 브리핑 섹션 노출. 데이터가 있으면 카드 렌더, 없으면 미렌더(섹션 부재). 모바일 폭(390px)에서 카드 1열 스택.

> 로컬 docker DB가 비어 섹션이 안 보이면, Task 3 시드 또는 실제 수집 데이터가 있는 환경에서 확인. `briefing == null` 시 미렌더가 정상 동작.

- [ ] **Step 5: Commit**
```bash
git add app/\(public\)/_components/market-briefing.tsx app/\(public\)/page.tsx
git commit -m "feat(home): 오늘의 부동산 한입 브리핑 섹션 렌더"
```

---

## Self-Review (작성자 체크 완료)

- **스펙 커버리지:** "오늘"=createdAt(Task1) · 매매 한정(Task3 where) · 시군구 단위(groupBy sigunguCode) · 3개 위젯(Task3/4) · 폴백(Task3) · 급증=계약일(Task3) · 평형버킷(Task2) · 빈상태 미렌더(Task4) · 해시태그(Task2/4) · 배치(Task4 Step2) — 모두 태스크에 매핑됨. 신고가 TOP3는 스펙상 비범위(v2).
- **플레이스홀더:** 없음(모든 코드/명령 구체화).
- **타입 일관성:** `MarketBriefing`/`RegionCount`/`SurgeRegion`/`TxHighlight`(Task2 정의) ↔ `getMarketBriefing`(Task3) ↔ 컴포넌트 props(Task4) 일치. 헬퍼명(`kstDayStartUtc`, `contractDateWindows`, `areaBandLabel`, `regionLabel`, `buildHashtags`) 태스크 간 동일.

## 위험/메모

- `Prisma.Decimal` import 필요(`exclusiveArea` 비교) — Task3 코드의 `import { ... Prisma } from '@prisma/client'`에 포함.
- 라이브 집계는 ISR 1시간 캐시(`page.tsx`의 `revalidate=3600`)에 의존. 쿼리 비용이 문제되면 v2에서 스냅샷 테이블로 전환(스펙 §4 접근2).
- `getMarketBriefing` 통합 테스트는 빈 `.env.test` DB 전제(전국 최고가 단언). 다른 데이터가 섞이면 시군구 한정이 필요할 수 있음.
