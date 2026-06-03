# 아파트 상세 — 거래유형 탭 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/apt/[id]` 상세의 "최근 실거래 내역"과 "주변 단지 실거래가 비교" 두 섹션을 전체/매매/전세/월세 탭으로 필터링한다.

**Architecture:** 실거래 내역은 서버액션으로 탭별 데이터를 재조회(페이지네이션 유지), 주변 단지는 한 번 받은 데이터를 클라이언트 탭으로 전환. 테스트 가능한 DB 함수·순수 포맷 함수는 TDD, React 탭 UI는 타입체크+수동 검증(코드베이스에 컴포넌트 렌더 테스트 인프라 없음).

**Tech Stack:** Next.js (App Router, server actions), Prisma + PostgreSQL(PostGIS), Vitest(node env), TailwindCSS.

---

## 사전 준비

- 검증은 로컬 docker DB(`.env.test`) 기준. 테스트 전 DB가 떠 있고 마이그레이션 적용 상태여야 한다.
  - 확인/적용: `pnpm test:db:migrate`
- 단위/통합 테스트 실행: `pnpm test:unit` (내부적으로 `dotenv -e .env.test -- vitest run tests/lib tests/ingest`)
- 타입체크: `pnpm typecheck`

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `lib/transaction.ts` | 거래 조회 DB 함수 | `getUnifiedTransactions`에 `dealType?` 필터 추가 |
| `lib/nearby.ts` | 주변 단지 DB 함수 + 가격 포맷 | wolse 컬럼 추가, 순수 함수 `formatNearbyPrice` 추가 |
| `app/(public)/apt/[id]/actions.ts` | 서버액션 | `fetchUnifiedTxPage`에 `dealType?` 인자 추가 |
| `app/(public)/apt/[id]/page.tsx` | 페이지 조립 | 유형별 건수(`getTransactionCounts`) 전달 |
| `app/(public)/apt/[id]/_components/unified-transaction-table.tsx` | 실거래 내역 UI | 탭 추가 |
| `app/(public)/apt/[id]/_components/nearby-price-comparison.tsx` | 주변 단지 UI | client 전환 + 탭 추가 |
| `tests/lib/transaction-deal-type.test.ts` | 신규 통합 테스트 | 생성 |
| `tests/lib/nearby.test.ts` | 신규 통합 테스트 | 생성 |
| `tests/lib/nearby-format.test.ts` | 신규 순수 단위 테스트 | 생성 |

---

## Task 1: `getUnifiedTransactions` 에 dealType 필터 추가

**Files:**
- Test: `tests/lib/transaction-deal-type.test.ts` (Create)
- Modify: `lib/transaction.ts` (`getUnifiedTransactions`, 약 127-164행)

- [ ] **Step 1: 실패하는 통합 테스트 작성**

Create `tests/lib/transaction-deal-type.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getUnifiedTransactions } from '@/lib/transaction';

const REGION = '9999999999'; // VarChar(10)
const SIGUNGU = '99999'; // VarChar(5)
let propId: bigint;

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    update: {},
    create: { code: REGION, sido: '테스트', fullName: '테스트', level: 3, sourceVersion: 'test' },
  });
  const prop = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name: '탭테스트',
      nameNorm: '탭테스트',
      regionCode: REGION,
      address: '테스트 주소',
    },
  });
  propId = prop.id;

  const mk = (dealType: DealType, i: number) => ({
    propertyId: propId,
    propertyType: PropertyType.APARTMENT,
    regionCode: REGION,
    sigunguCode: SIGUNGU,
    dealType,
    contractDate: new Date(2026, 0, i + 1),
    exclusiveArea: 59.99,
    floor: 5,
    dealAmount: dealType === DealType.SALE ? 100_000 + i : null,
    deposit: dealType !== DealType.SALE ? 50_000 : null,
    monthlyRent: dealType === DealType.WOLSE ? 80 : 0,
    source: 'test',
    rawHash: createHash('sha256').update(`${propId}-${dealType}-${i}`).digest('hex'),
  });

  await prisma.transaction.createMany({
    data: [
      mk(DealType.SALE, 0),
      mk(DealType.SALE, 1),
      mk(DealType.SALE, 2),
      mk(DealType.JEONSE, 3),
      mk(DealType.JEONSE, 4),
      mk(DealType.WOLSE, 5),
    ],
  });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { propertyId: propId } });
  await prisma.property.delete({ where: { id: propId } });
  await prisma.region.delete({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('getUnifiedTransactions dealType 필터', () => {
  it('dealType 미지정 시 전체 6건 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15 });
    expect(r.totalCount).toBe(6);
  });

  it('SALE 필터 시 매매 3건만 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15, dealType: DealType.SALE });
    expect(r.totalCount).toBe(3);
    expect(r.rows.every((row) => row.dealType === 'SALE')).toBe(true);
  });

  it('WOLSE 필터 시 월세 1건 + monthlyRent 반환', async () => {
    const r = await getUnifiedTransactions(propId, { page: 1, perPage: 15, dealType: DealType.WOLSE });
    expect(r.totalCount).toBe(1);
    expect(r.rows[0].dealType).toBe('WOLSE');
    expect(r.rows[0].monthlyRent).toBe(80);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test:unit -- transaction-deal-type`
Expected: FAIL — "SALE 필터" 테스트가 totalCount 6을 받아 3과 불일치 (현재 `getUnifiedTransactions`가 dealType을 무시).

- [ ] **Step 3: `getUnifiedTransactions` 에 dealType 필터 구현**

In `lib/transaction.ts`, replace the `getUnifiedTransactions` function body (현재 127-164행):

```ts
export async function getUnifiedTransactions(
  propertyId: bigint,
  params: { page?: number; perPage?: number; dealType?: DealType },
): Promise<{ rows: UnifiedTxRow[]; totalCount: number }> {
  const { page = 1, perPage = 15, dealType } = params;
  const where: Prisma.TransactionWhereInput = {
    propertyId,
    ...(dealType ? { dealType } : {}),
  };
  const [rawRows, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        dealType: true,
        contractDate: true,
        exclusiveArea: true,
        floor: true,
        dealAmount: true,
        deposit: true,
        monthlyRent: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    rows: rawRows.map((t) => ({
      id: String(t.id),
      dealType: t.dealType,
      contractDate: t.contractDate.toISOString().slice(0, 10),
      exclusiveArea: Number(t.exclusiveArea),
      floor: t.floor,
      dealAmount: t.dealAmount !== null ? Number(t.dealAmount) : null,
      deposit: t.deposit !== null ? Number(t.deposit) : null,
      monthlyRent: t.monthlyRent !== null ? Number(t.monthlyRent) : null,
    })),
    totalCount,
  };
}
```

(`DealType`과 `Prisma`는 이미 `lib/transaction.ts` 상단에서 import됨.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit -- transaction-deal-type`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/transaction.ts tests/lib/transaction-deal-type.test.ts
git commit -m "feat(apt): getUnifiedTransactions dealType 필터 추가"
```

---

## Task 2: `getNearbyProperties` 에 월세 컬럼 노출

**Files:**
- Test: `tests/lib/nearby.test.ts` (Create)
- Modify: `lib/nearby.ts` (`NearbyProperty` 인터페이스, 쿼리 SELECT, 매핑)

- [ ] **Step 1: 실패하는 통합 테스트 작성**

Create `tests/lib/nearby.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getNearbyProperties } from '@/lib/nearby';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';

const REGION = '9999999999';
const SIGUNGU = '99999';
let centerId: bigint;
let neighborId: bigint;

async function seedProp(name: string, lng: number, lat: number): Promise<bigint> {
  const prop = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name,
      nameNorm: name,
      regionCode: REGION,
      address: '테스트 주소',
    },
  });
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${prop.id}
  `;
  for (const dealType of [DealType.SALE, DealType.JEONSE, DealType.WOLSE]) {
    await prisma.transaction.create({
      data: {
        propertyId: prop.id,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION,
        sigunguCode: SIGUNGU,
        dealType,
        contractDate: new Date(),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: dealType === DealType.SALE ? 200_000 : null,
        deposit: dealType !== DealType.SALE ? 100_000 : null,
        monthlyRent: dealType === DealType.WOLSE ? 90 : 0,
        source: 'test',
        rawHash: createHash('sha256').update(`${prop.id}-${dealType}`).digest('hex'),
      },
    });
  }
  await updatePropertyAggregates([prop.id]);
  return prop.id;
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    update: {},
    create: { code: REGION, sido: '테스트', fullName: '테스트', level: 3, sourceVersion: 'test' },
  });
  centerId = await seedProp('센터단지', 127.0, 37.5);
  neighborId = await seedProp('이웃단지', 127.001, 37.5); // 약 88m
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { propertyId: { in: [centerId, neighborId] } } });
  await prisma.property.deleteMany({ where: { id: { in: [centerId, neighborId] } } });
  await prisma.region.delete({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('getNearbyProperties 월세 노출', () => {
  it('이웃 단지의 월세 보증금/월세를 반환', async () => {
    const items = await getNearbyProperties({
      propertyId: centerId,
      propertyType: PropertyType.APARTMENT,
    });
    const n = items.find((i) => i.id === String(neighborId));
    expect(n).toBeDefined();
    expect(n!.wolseLastDeposit).toBe(100_000);
    expect(n!.wolseLastRent).toBe(90);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test:unit -- nearby.test`
Expected: FAIL — `n.wolseLastDeposit`이 `undefined` (현재 `NearbyProperty`에 wolse 필드 없음 → 타입 에러 또는 undefined).

- [ ] **Step 3: `lib/nearby.ts` 에 월세 컬럼 추가**

In `lib/nearby.ts`, update the `NearbyProperty` interface:

```ts
export interface NearbyProperty {
  id: string;
  name: string;
  address: string;
  region: string;
  distKm: number;
  saleLastPrice: number | null;
  jeonseLastDeposit: number | null;
  wolseLastDeposit: number | null;
  wolseLastRent: number | null;
}
```

Update the raw query row type and SELECT (현재 21-51행). Add to the row generic type:

```ts
      sale_last_price: number | null;
      jeonse_last_deposit: number | null;
      wolse_last_deposit: number | null;
      wolse_last_rent: number | null;
```

And in the `SELECT` body, after the `jeonseLastDeposit` line:

```ts
      p."saleLastPrice"::float AS sale_last_price,
      p."jeonseLastDeposit"::float AS jeonse_last_deposit,
      p."wolseLastDeposit"::float AS wolse_last_deposit,
      p."wolseLastRent"::float AS wolse_last_rent
```

Update the `.map`:

```ts
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    address: r.address,
    region: r.full_name,
    distKm: r.dist_km,
    saleLastPrice: r.sale_last_price,
    jeonseLastDeposit: r.jeonse_last_deposit,
    wolseLastDeposit: r.wolse_last_deposit,
    wolseLastRent: r.wolse_last_rent,
  }));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit -- nearby.test`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add lib/nearby.ts tests/lib/nearby.test.ts
git commit -m "feat(apt): 주변 단지 쿼리에 월세 보증금/월세 노출"
```

---

## Task 3: 주변 단지 가격 포맷 순수 함수 `formatNearbyPrice`

**Files:**
- Test: `tests/lib/nearby-format.test.ts` (Create)
- Modify: `lib/nearby.ts` (순수 함수 추가)

- [ ] **Step 1: 실패하는 단위 테스트 작성**

Create `tests/lib/nearby-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatNearbyPrice, type NearbyProperty } from '@/lib/nearby';

const base: NearbyProperty = {
  id: '1',
  name: '단지',
  address: '주소',
  region: '서울',
  distKm: 0.1,
  saleLastPrice: 1_200_000_000,
  jeonseLastDeposit: 700_000_000,
  wolseLastDeposit: 50_000_000,
  wolseLastRent: 90,
};

describe('formatNearbyPrice', () => {
  it('SALE 탭: 매매가만', () => {
    expect(formatNearbyPrice(base, 'SALE')).toBe('12억');
  });

  it('JEONSE 탭: 전세가만', () => {
    expect(formatNearbyPrice(base, 'JEONSE')).toBe('7억');
  });

  it('WOLSE 탭: 보증금/월세', () => {
    expect(formatNearbyPrice(base, 'WOLSE')).toBe('보 5,000만 / 월 90만');
  });

  it('ALL 탭: 세 유형 모두', () => {
    expect(formatNearbyPrice(base, 'ALL')).toBe('매매 12억 · 전세 7억 · 월세 보 5,000만 / 월 90만');
  });

  it('데이터 없으면 해당 자리에 -', () => {
    const empty: NearbyProperty = {
      ...base,
      saleLastPrice: null,
      jeonseLastDeposit: null,
      wolseLastDeposit: null,
      wolseLastRent: null,
    };
    expect(formatNearbyPrice(empty, 'SALE')).toBe('-');
    expect(formatNearbyPrice(empty, 'ALL')).toBe('매매 - · 전세 - · 월세 -');
  });
});
```

> 참고: 기대 문자열(`12억`, `5,000만`)은 `lib/format.ts`의 `formatBillion` 출력 규칙을 따른다. Step 2 실행 시 실제 출력과 다르면 `formatBillion` 규칙에 맞춰 기대값을 한 번 수정한 뒤 진행한다.

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test:unit -- nearby-format`
Expected: FAIL — `formatNearbyPrice`가 export되지 않음.

- [ ] **Step 3: `formatNearbyPrice` 구현**

In `lib/nearby.ts`, add import at top:

```ts
import { formatBillion } from '@/lib/format';
```

Add at the end of the file:

```ts
export type NearbyTab = 'ALL' | 'SALE' | 'JEONSE' | 'WOLSE';

export function formatNearbyPrice(item: NearbyProperty, tab: NearbyTab): string {
  const sale = item.saleLastPrice != null ? formatBillion(item.saleLastPrice) : '-';
  const jeonse = item.jeonseLastDeposit != null ? formatBillion(item.jeonseLastDeposit) : '-';
  const wolse =
    item.wolseLastDeposit != null
      ? `보 ${formatBillion(item.wolseLastDeposit)} / 월 ${(item.wolseLastRent ?? 0).toLocaleString('ko-KR')}만`
      : '-';
  switch (tab) {
    case 'SALE':
      return sale;
    case 'JEONSE':
      return jeonse;
    case 'WOLSE':
      return wolse;
    case 'ALL':
      return `매매 ${sale} · 전세 ${jeonse} · 월세 ${wolse}`;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit -- nearby-format`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/nearby.ts tests/lib/nearby-format.test.ts
git commit -m "feat(apt): 주변 단지 탭별 가격 포맷 함수 추가"
```

---

## Task 4: 서버액션 + 페이지에서 유형별 건수 전달

**Files:**
- Modify: `app/(public)/apt/[id]/actions.ts` (`fetchUnifiedTxPage`)
- Modify: `app/(public)/apt/[id]/page.tsx`

- [ ] **Step 1: 서버액션에 dealType 인자 추가**

In `app/(public)/apt/[id]/actions.ts`, replace `fetchUnifiedTxPage`:

```ts
export async function fetchUnifiedTxPage(propertyId: bigint, page: number, dealType?: DealType) {
  return getUnifiedTransactions(propertyId, { page, perPage: 15, dealType });
}
```

(`DealType`은 이미 `actions.ts` 상단에서 import됨.)

- [ ] **Step 2: 페이지에서 건수 맵 계산·전달**

In `app/(public)/apt/[id]/page.tsx`:

import에 `getTransactionCounts` 추가 (3행 수정):

```ts
import {
  getMonthlyChartData,
  getAreaSummary,
  getUnifiedTransactions,
  getTransactionCounts,
} from '@/lib/transaction';
```

`Promise.all` (현재 43-51행)에 `getTransactionCounts` 추가:

```ts
  const [unified, counts, chart, areaSummary, nearby, infra] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getTransactionCounts(propId),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
  ]);
```

`UnifiedTransactionTable` 사용처 (현재 59-64행)를 `totalCount` 대신 `counts` 전달로 변경:

```tsx
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            counts={counts}
          />
```

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: `UnifiedTransactionTable`의 props 불일치로 에러 발생 가능 — Task 5에서 컴포넌트 시그니처를 맞추면 해소된다. (이 시점 타입에러는 정상; Task 5 직후 다시 통과해야 함.)

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/apt/[id]/actions.ts" "app/(public)/apt/[id]/page.tsx"
git commit -m "feat(apt): 실거래 서버액션 dealType 인자 + 유형별 건수 전달"
```

---

## Task 5: 최근 실거래 내역 탭 UI

**Files:**
- Modify: `app/(public)/apt/[id]/_components/unified-transaction-table.tsx`

- [ ] **Step 1: 컴포넌트에 탭 추가**

`unified-transaction-table.tsx` 의 컴포넌트 시그니처와 상단 로직(현재 32-55행)을 교체:

```tsx
type DealTab = 'ALL' | DealType;

const TABS: { key: DealTab; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

export function UnifiedTransactionTable({
  propertyId,
  initialRows,
  counts,
  id,
}: {
  propertyId: string;
  initialRows: UnifiedTxRow[];
  counts: Record<DealType, number>;
  id?: string;
}) {
  const [tab, setTab] = useState<DealTab>('ALL');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedTxRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLElement>(null);

  const totalCount = tab === 'ALL' ? counts.SALE + counts.JEONSE + counts.WOLSE : counts[tab];
  const activeLabel = TABS.find((t) => t.key === tab)!.label;

  function changeTab(next: DealTab) {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(BigInt(propertyId), 1, next === 'ALL' ? undefined : next);
      setRows(data.rows);
    });
  }

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(
        BigInt(propertyId),
        newPage,
        tab === 'ALL' ? undefined : tab,
      );
      setRows(data.rows);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
```

- [ ] **Step 2: 헤더 건수 + 탭 버튼 렌더**

헤더 `<h2>` (현재 59-62행)를 교체하고 그 아래 탭 버튼 그룹을 추가:

```tsx
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">
          최근 실거래 내역{' '}
          <span className="text-sm font-medium text-[var(--color-muted)]">
            ({activeLabel} {totalCount}건)
          </span>
        </h2>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              disabled={pending}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-blue-dark)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
```

> `totalCount === 0` 분기, 표/모바일 카드 마크업, `Pagination` 블록은 기존 그대로 유지한다. `Pagination`의 `totalPages={Math.ceil(totalCount / PER_PAGE)}`는 위에서 새로 계산한 `totalCount`를 그대로 사용하므로 수정 불필요.

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (Task 4의 props 불일치도 함께 해소)

- [ ] **Step 4: 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공 (타입/린트 에러 없음)

- [ ] **Step 5: 수동 검증**

`pnpm dev` 실행 후 거래가 많은 아파트 상세(`/apt/<id>`)에서:
- 탭 전환 시 표 내용과 헤더 건수(`(매매 N건)` 등)가 해당 유형으로 바뀐다.
- 탭 전환 후 페이지가 1로 리셋된다.
- 거래 없는 유형 탭은 "거래 내역이 없습니다."가 표시된다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/unified-transaction-table.tsx"
git commit -m "feat(apt): 최근 실거래 내역 거래유형 탭 추가"
```

---

## Task 6: 주변 단지 비교 탭 UI

**Files:**
- Modify: `app/(public)/apt/[id]/_components/nearby-price-comparison.tsx`

- [ ] **Step 1: client 컴포넌트로 전환 + 탭 추가**

`nearby-price-comparison.tsx` 전체를 교체:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatNearbyPrice, type NearbyProperty, type NearbyTab } from '@/lib/nearby';

const TABS: { key: NearbyTab; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

export function NearbyPriceComparison({
  items,
  slug,
  id,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
  id?: string;
}) {
  const [tab, setTab] = useState<NearbyTab>('ALL');

  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주변 단지 실거래가 비교</h2>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-blue-dark)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {it.region} · {it.distKm.toFixed(2)}km
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-bold text-[var(--color-blue-dark)]">
                {formatNearbyPrice(it, tab)}
              </p>
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
Expected: PASS

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공

- [ ] **Step 4: 수동 검증**

`/apt/<id>` 상세에서:
- 탭 전환 시 우측 가격이 매매/전세/월세/전체로 바뀐다.
- 모든 단지(최대 10개)가 모든 탭에서 표시되고, 해당 유형 데이터 없으면 `-`로 보인다.
- 전체 탭은 `매매 X · 전세 Y · 월세 보Z/월W` 형태로 표시된다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/nearby-price-comparison.tsx"
git commit -m "feat(apt): 주변 단지 비교 거래유형 탭 추가"
```

---

## 최종 검증

- [ ] `pnpm test:unit` 전체 통과
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm build` 통과
- [ ] 수동: 두 섹션 탭 동작 (Task 5 Step 5, Task 6 Step 4) 확인

## 참고 (구현자 메모)

- 주변 단지 비교 컴포넌트(`nearby-price-comparison.tsx`)는 officetel/villa 상세에서도 공유될 수 있다. 이번 변경은 props·동작이 하위호환(필드 추가만)이라 그쪽도 동일하게 탭이 생긴다 — 의도된 동작. 데이터(월세 컬럼)는 동일 `getNearbyProperties`를 쓰면 자동 반영된다.
- `getTransactionsByType`/`getTransactionCounts`는 기존 함수이며 이번 작업에서 시그니처 변경 없음.
