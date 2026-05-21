# 실거래가 상세 페이지 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/apt/[id]/`, `/officetel/[id]/`, `/villa/[id]/` detail pages to a 2-column layout (main + sticky sidebar) with 6 new sections built from available data.

**Architecture:** Add `getAreaSummary` and `getUnifiedTransactions` to `lib/transaction.ts`, extend `lib/nearby.ts` with price fields, add `fetchUnifiedTxPage` server action to `actions.ts`, create 6 new components in `apt/[id]/_components/`, rewrite all 3 `page.tsx` files, then delete 5 legacy components. officetel/villa import new components from `apt/[id]/_components/` — same pattern as before.

**Tech Stack:** Next.js 15 App Router, Prisma + PostgreSQL (raw SQL for aggregations), Recharts, Tailwind CSS

---

### Task 1: Extend `lib/transaction.ts` with two new functions

**Files:**
- Modify: `lib/transaction.ts`

- [ ] **Step 1: Append to `lib/transaction.ts`**

```ts
export interface UnifiedTxRow {
  id: string;
  dealType: DealType;
  contractDate: string;
  exclusiveArea: number;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

export interface AreaSummaryItem {
  area: number;
  lastPrice: number | null;
  avg12m: number | null;
  count12m: number;
}

export async function getAreaSummary(propertyId: bigint): Promise<AreaSummaryItem[]> {
  const rows = await prisma.$queryRaw<
    Array<{ area: number; last_price: number | null; avg_12m: number | null; cnt_12m: number }>
  >`
    WITH base AS (
      SELECT
        ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS area_pyeong,
        "dealAmount",
        "contractDate"
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "dealType" = 'SALE'
        AND "dealAmount" IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (area_pyeong)
        area_pyeong,
        "dealAmount"::float AS last_price
      FROM base
      ORDER BY area_pyeong, "contractDate" DESC
    ),
    stats AS (
      SELECT
        area_pyeong,
        AVG("dealAmount")::float AS avg_12m,
        COUNT(*)::int AS cnt_12m
      FROM base
      WHERE "contractDate" >= NOW() - INTERVAL '12 months'
      GROUP BY area_pyeong
    )
    SELECT
      l.area_pyeong AS area,
      l.last_price,
      s.avg_12m,
      COALESCE(s.cnt_12m, 0) AS cnt_12m
    FROM latest l
    LEFT JOIN stats s ON s.area_pyeong = l.area_pyeong
    ORDER BY COALESCE(s.cnt_12m, 0) DESC
    LIMIT 4
  `;
  return rows.map((r) => ({
    area: r.area,
    lastPrice: r.last_price,
    avg12m: r.avg_12m,
    count12m: r.cnt_12m,
  }));
}

export async function getUnifiedTransactions(
  propertyId: bigint,
  params: { page?: number; perPage?: number },
): Promise<{ rows: UnifiedTxRow[]; totalCount: number }> {
  const { page = 1, perPage = 15 } = params;
  const [rawRows, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { propertyId },
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
    prisma.transaction.count({ where: { propertyId } }),
  ]);
  return {
    rows: rawRows.map((t) => ({
      id: String(t.id),
      dealType: t.dealType,
      contractDate: t.contractDate.toISOString().slice(0, 10),
      exclusiveArea: Number(t.exclusiveArea),
      floor: t.floor,
      dealAmount: t.dealAmount as number | null,
      deposit: t.deposit as number | null,
      monthlyRent: t.monthlyRent as number | null,
    })),
    totalCount,
  };
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: TSC exit 0

- [ ] **Step 3: Commit**

```bash
git add lib/transaction.ts
git commit -m "feat(transaction): add getAreaSummary and getUnifiedTransactions"
```

---

### Task 2: Add `fetchUnifiedTxPage` to `actions.ts`

**Files:**
- Modify: `app/(public)/apt/[id]/actions.ts`

- [ ] **Step 1: Replace entire file**

```ts
'use server';
import { getTransactionsByType, getUnifiedTransactions } from '@/lib/transaction';
import type { DealType } from '@prisma/client';

export async function fetchTxPage(
  propertyId: bigint,
  dealType: DealType,
  page: number,
  area?: number | null,
) {
  const rows = await getTransactionsByType(propertyId, dealType, {
    page,
    perPage: 10,
    area: area ?? null,
  });
  return rows.map((t) => ({
    id: String(t.id),
    contractDate: t.contractDate.toISOString().slice(0, 10),
    exclusiveArea: Number(t.exclusiveArea),
    floor: t.floor,
    dealAmount: t.dealAmount,
    deposit: t.deposit,
    monthlyRent: t.monthlyRent,
  }));
}

export async function fetchUnifiedTxPage(propertyId: bigint, page: number) {
  return getUnifiedTransactions(propertyId, { page, perPage: 15 });
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/actions.ts"
git commit -m "feat(actions): add fetchUnifiedTxPage server action"
```

---

### Task 3: Extend `lib/nearby.ts` with price fields

**Files:**
- Modify: `lib/nearby.ts`

- [ ] **Step 1: Replace entire file**

```ts
import { prisma } from '@/lib/db';
import type { PropertyType } from '@prisma/client';

export interface NearbyProperty {
  id: string;
  name: string;
  address: string;
  region: string;
  distKm: number;
  saleLastPrice: number | null;
  jeonseLastDeposit: number | null;
}

export async function getNearbyProperties(opts: {
  propertyId: bigint;
  propertyType: PropertyType;
  radiusMeters?: number;
  limit?: number;
}): Promise<NearbyProperty[]> {
  const { propertyId, propertyType, radiusMeters = 2000, limit = 10 } = opts;
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      name: string;
      address: string;
      full_name: string;
      dist_km: number;
      sale_last_price: number | null;
      jeonse_last_deposit: number | null;
    }>
  >`
    WITH center AS (
      SELECT location FROM "Property" WHERE id = ${propertyId}
    )
    SELECT
      p.id, p.name, p.address, r."fullName" AS full_name,
      (ST_Distance(p.location, c.location) / 1000.0) AS dist_km,
      p."saleLastPrice"::float AS sale_last_price,
      p."jeonseLastDeposit"::float AS jeonse_last_deposit
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    JOIN center c ON true
    WHERE p."propertyType" = ${propertyType}::"PropertyType"
      AND p.id <> ${propertyId}
      AND p.location IS NOT NULL
      AND c.location IS NOT NULL
      AND ST_DWithin(p.location, c.location, ${radiusMeters})
      AND p."txCount12m" > 0
    ORDER BY dist_km ASC, p."txCount12m" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    address: r.address,
    region: r.full_name,
    distKm: r.dist_km,
    saleLastPrice: r.sale_last_price,
    jeonseLastDeposit: r.jeonse_last_deposit,
  }));
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: no errors — existing `NearbyProperties` component doesn't use the new fields so no breakage

- [ ] **Step 3: Commit**

```bash
git add lib/nearby.ts
git commit -m "feat(nearby): add saleLastPrice and jeonseLastDeposit fields"
```

---

### Task 4: Create `property-detail-hero.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/property-detail-hero.tsx`

- [ ] **Step 1: Create file**

```tsx
import type { Property, Region } from '@prisma/client';
import { formatBillion } from '@/lib/format';

export function PropertyDetailHero({
  property,
  region,
}: {
  property: Property;
  region: Region;
}) {
  const txCount = Number(property.txCount12m ?? 0);
  const trend = txCount > 10 ? '거래 활발' : txCount > 3 ? '소폭 거래' : '거래 소강';

  const boxes = [
    { label: '최근 매매 실거래', value: formatBillion(property.saleLastPrice) },
    { label: '최근 전세 실거래', value: formatBillion(property.jeonseLastDeposit) },
    {
      label: '최근 월세 실거래',
      value:
        property.wolseLastDeposit != null
          ? `${formatBillion(property.wolseLastDeposit)} / ${Number(property.wolseLastRent ?? 0).toLocaleString('ko-KR')}만`
          : '-',
    },
    { label: '최근 거래 흐름', value: trend },
  ];

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-white shadow-[var(--shadow)]">
      <div className="flex min-h-[200px] items-end bg-gradient-to-br from-[#1e3a8a] to-[#38bdf8] p-8 text-white">
        <div>
          <span className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            실거래가 상세
          </span>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{property.name}</h1>
          <p className="mt-2 text-white/80">
            {region.fullName}
            {property.builtYear ? ` · ${property.builtYear}년 준공` : ''}
            {property.households
              ? ` · ${Number(property.households).toLocaleString('ko-KR')}세대`
              : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-line)] md:grid-cols-4">
        {boxes.map((box) => (
          <div key={box.label} className="bg-white p-5">
            <p className="text-xs text-[var(--color-muted)]">{box.label}</p>
            <p className="mt-2 text-xl font-bold text-[var(--color-blue-dark)]">{box.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/property-detail-hero.tsx"
git commit -m "feat(components): add PropertyDetailHero"
```

---

### Task 5: Create `deal-summary-section.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/deal-summary-section.tsx`

- [ ] **Step 1: Create file**

```tsx
import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

const ITEMS = [
  {
    icon: '📌',
    title: '최근 매매가',
    getValue: (p: Property) =>
      p.saleLastPrice
        ? `${formatBillion(p.saleLastPrice)} · 12개월 평균 ${formatBillion(p.saleAvgPrice12m)}`
        : '최근 거래 없음',
  },
  {
    icon: '🔁',
    title: '거래 분위기',
    getValue: (p: Property) =>
      Number(p.txCount12m) > 0
        ? `최근 12개월 ${Number(p.txCount12m)}건 거래 발생`
        : '최근 12개월 거래 없음',
  },
  {
    icon: '🏠',
    title: '전세 흐름',
    getValue: (p: Property) =>
      p.jeonseLastDeposit
        ? `최근 전세 ${formatBillion(p.jeonseLastDeposit)} · 12개월 평균 ${formatBillion(p.jeonseAvgDeposit12m)}`
        : '최근 전세 거래 없음',
  },
  {
    icon: '💬',
    title: '월세 현황',
    getValue: (p: Property) =>
      p.wolseLastDeposit != null
        ? `보증금 ${formatBillion(p.wolseLastDeposit)} / 월 ${Number(p.wolseLastRent ?? 0).toLocaleString('ko-KR')}만원`
        : '최근 월세 거래 없음',
  },
] as const;

export function DealSummarySection({
  property,
  id,
}: {
  property: Property;
  id?: string;
}) {
  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">실거래가 핵심 요약</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
            <span className="text-xl">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-[var(--color-blue-dark)]">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{item.getValue(property)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/deal-summary-section.tsx"
git commit -m "feat(components): add DealSummarySection"
```

---

### Task 6: Create `unified-transaction-table.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/unified-transaction-table.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client';

import { useState, useTransition, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { formatBillion, formatPyeong } from '@/lib/format';
import { fetchUnifiedTxPage } from '../actions';
import type { UnifiedTxRow } from '@/lib/transaction';
import type { DealType } from '@prisma/client';

const PER_PAGE = 15;

const DEAL_LABEL: Record<DealType, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };
const DEAL_COLOR: Record<DealType, string> = {
  SALE: 'bg-blue-100 text-blue-700',
  JEONSE: 'bg-green-100 text-green-700',
  WOLSE: 'bg-orange-100 text-orange-700',
};

function formatPrice(row: UnifiedTxRow): string {
  if (row.dealType === 'SALE') return formatBillion(row.dealAmount);
  if (row.dealType === 'JEONSE') return formatBillion(row.deposit);
  if (row.deposit != null)
    return `보 ${formatBillion(row.deposit)} / 월 ${Number(row.monthlyRent ?? 0).toLocaleString('ko-KR')}만`;
  return '-';
}

export function UnifiedTransactionTable({
  propertyId,
  initialRows,
  totalCount,
  id,
}: {
  propertyId: string;
  initialRows: UnifiedTxRow[];
  totalCount: number;
  id?: string;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedTxRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLElement>(null);

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(BigInt(propertyId), newPage);
      setRows(data.rows);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return (
    <section ref={ref} id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
        최근 실거래 내역{' '}
        <span className="text-sm font-medium text-[var(--color-muted)]">(전체 {totalCount}건)</span>
      </h2>
      {totalCount === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-muted)]">거래 내역이 없습니다.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)]">
              <tr className="text-left text-xs font-bold uppercase text-[var(--color-muted)]">
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">계약일</th>
                <th className="px-4 py-3">평형</th>
                <th className="px-4 py-3">층</th>
                <th className="px-4 py-3 text-right">거래가</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${DEAL_COLOR[r.dealType]}`}
                    >
                      {DEAL_LABEL[r.dealType]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.contractDate}</td>
                  <td className="px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPrice(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--color-line)] px-4">
            <Pagination
              current={page}
              totalPages={Math.ceil(totalCount / PER_PAGE)}
              totalItems={totalCount}
              perPage={PER_PAGE}
              onChange={goTo}
              disabled={pending}
            />
          </div>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/unified-transaction-table.tsx"
git commit -m "feat(components): add UnifiedTransactionTable"
```

---

### Task 7: Create `area-comparison.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/area-comparison.tsx`

- [ ] **Step 1: Create file**

```tsx
import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { AreaSummaryItem } from '@/lib/transaction';

export function AreaComparison({
  areas,
  id,
}: {
  areas: AreaSummaryItem[];
  id?: string;
}) {
  if (areas.length === 0) return null;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">면적별 실거래 비교</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((item) => (
          <div key={item.area} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sky-soft)] text-xs font-bold text-[var(--color-blue-dark)]">
              {item.area}평
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--color-blue-dark)]">
                최근 매매 {formatBillion(item.lastPrice)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                12개월 평균 {formatBillion(item.avg12m)} · {item.count12m}건
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/area-comparison.tsx"
git commit -m "feat(components): add AreaComparison"
```

---

### Task 8: Create `nearby-price-comparison.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/nearby-price-comparison.tsx`

- [ ] **Step 1: Create file**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { NearbyProperty } from '@/lib/nearby';

export function NearbyPriceComparison({
  items,
  slug,
  id,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
  id?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">
        주변 단지 실거래가 비교
      </h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {it.region} · {it.distKm.toFixed(2)}km
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--color-blue-dark)]">
                  {it.saleLastPrice != null ? formatBillion(it.saleLastPrice) : '-'}
                </p>
                {it.jeonseLastDeposit != null && (
                  <p className="text-xs text-[var(--color-muted)]">
                    전세 {formatBillion(it.jeonseLastDeposit)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/nearby-price-comparison.tsx"
git commit -m "feat(components): add NearbyPriceComparison"
```

---

### Task 9: Create `detail-sidebar.tsx`

**Files:**
- Create: `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

- [ ] **Step 1: Create file**

```tsx
import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

const ANCHORS = [
  { href: '#summary', label: '핵심 요약' },
  { href: '#transactions', label: '최근 실거래' },
  { href: '#chart', label: '가격 그래프' },
  { href: '#area', label: '면적별 비교' },
  { href: '#nearby', label: '주변 단지 비교' },
];

export function DetailSidebar({ property }: { property: Property }) {
  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">실거래 요약</h3>
        <ul className="space-y-1 text-sm text-[var(--color-muted)]">
          <li>매매 최근 {formatBillion(property.saleLastPrice)}</li>
          <li>전세 최근 {formatBillion(property.jeonseLastDeposit)}</li>
          <li>12개월 거래 {Number(property.txCount12m)}건</li>
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
        <ul className="flex flex-col gap-2">
          {ANCHORS.map((a) => (
            <li key={a.href}>
              <a
                href={a.href}
                className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
              >
                {a.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/_components/detail-sidebar.tsx"
git commit -m "feat(components): add DetailSidebar"
```

---

### Task 10: Rewrite `apt/[id]/page.tsx`

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getMonthlyChartData, getAreaSummary, getUnifiedTransactions } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from './_components/property-detail-hero';
import { DealSummarySection } from './_components/deal-summary-section';
import { UnifiedTransactionTable } from './_components/unified-transaction-table';
import { PriceCharts } from './_components/price-charts';
import { AreaComparison } from './_components/area-comparison';
import { NearbyPriceComparison } from './_components/nearby-price-comparison';
import { DetailSidebar } from './_components/detail-sidebar';
import { formatBillion } from '@/lib/format';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const property = await getPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  return {
    title: `${property.name} 실거래가 · ${property.region.fullName}`,
    description: `${property.name}(${property.builtYear ?? '?'}년 준공). 매매 평균 ${formatBillion(property.saleAvgPrice12m)} · 전세 ${formatBillion(property.jeonseAvgDeposit12m)} · 거래 ${property.txCount12m}건.`,
    alternates: { canonical: `/apt/${property.id}` },
  };
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.APARTMENT) notFound();

  const [unified, chart, areaSummary, nearby] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            totalCount={unified.totalCount}
          />
          <section id="chart">
            <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
              가격 흐름 그래프
            </h2>
            <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
          </section>
          <AreaComparison id="area" areas={areaSummary} />
          <NearbyPriceComparison id="nearby" items={nearby} slug="apt" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/apt/[id]/page.tsx"
git commit -m "feat(apt): redesign detail page with 2-column layout"
```

---

### Task 11: Rewrite `officetel/[id]/page.tsx`

**Files:**
- Modify: `app/(public)/officetel/[id]/page.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getMonthlyChartData, getAreaSummary, getUnifiedTransactions } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import { formatBillion } from '@/lib/format';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  return {
    title: `${p.name} 실거래가 · ${p.region.fullName}`,
    description: `${p.name} 오피스텔 실거래가 — 매매 평균 ${formatBillion(p.saleAvgPrice12m)} · 전세 ${formatBillion(p.jeonseAvgDeposit12m)}`,
    alternates: { canonical: `/officetel/${p.id}` },
  };
}

export default async function OffiDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.OFFICETEL) notFound();

  const [unified, chart, areaSummary, nearby] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.OFFICETEL }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            totalCount={unified.totalCount}
          />
          <section id="chart">
            <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
              가격 흐름 그래프
            </h2>
            <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
          </section>
          <AreaComparison id="area" areas={areaSummary} />
          <NearbyPriceComparison id="nearby" items={nearby} slug="officetel" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/officetel/[id]/page.tsx"
git commit -m "feat(officetel): apply 2-column detail page redesign"
```

---

### Task 12: Rewrite `villa/[id]/page.tsx`

**Files:**
- Modify: `app/(public)/villa/[id]/page.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getMonthlyChartData, getAreaSummary, getUnifiedTransactions } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType } from '@prisma/client';
import { PropertyDetailHero } from '../../apt/[id]/_components/property-detail-hero';
import { DealSummarySection } from '../../apt/[id]/_components/deal-summary-section';
import { UnifiedTransactionTable } from '../../apt/[id]/_components/unified-transaction-table';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { AreaComparison } from '../../apt/[id]/_components/area-comparison';
import { NearbyPriceComparison } from '../../apt/[id]/_components/nearby-price-comparison';
import { DetailSidebar } from '../../apt/[id]/_components/detail-sidebar';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  const typeLabel = p.propertyType === 'ROW_HOUSE' ? '연립' : '다세대';
  return {
    title: `${p.name} 실거래가 · ${typeLabel}`,
    description: `${p.name} ${typeLabel} 실거래가`,
    alternates: { canonical: `/villa/${p.id}` },
  };
}

export default async function VillaDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (
    !property ||
    (property.propertyType !== PropertyType.ROW_HOUSE &&
      property.propertyType !== PropertyType.MULTIPLEX)
  )
    notFound();

  const [unified, chart, areaSummary, nearby] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: property.propertyType }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <PropertyDetailHero property={property} region={property.region} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-8">
          <DealSummarySection id="summary" property={property} />
          <UnifiedTransactionTable
            id="transactions"
            propertyId={String(propId)}
            initialRows={unified.rows}
            totalCount={unified.totalCount}
          />
          <section id="chart">
            <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
              가격 흐름 그래프
            </h2>
            <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
          </section>
          <AreaComparison id="area" areas={areaSummary} />
          <NearbyPriceComparison id="nearby" items={nearby} slug="villa" />
        </main>
        <aside>
          <DetailSidebar property={property} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/villa/[id]/page.tsx"
git commit -m "feat(villa): apply 2-column detail page redesign"
```

---

### Task 13: Delete legacy components + final verification

**Files:**
- Delete: `app/(public)/apt/[id]/_components/property-header.tsx`
- Delete: `app/(public)/apt/[id]/_components/stats-cards.tsx`
- Delete: `app/(public)/apt/[id]/_components/transaction-section.tsx`
- Delete: `app/(public)/apt/[id]/_components/nearby-properties.tsx`
- Delete: `app/(public)/apt/[id]/_components/phase2-placeholder.tsx`
- Delete: `app/(public)/apt/[id]/_components/static-map.tsx`

- [ ] **Step 1: Delete files**

```bash
rm \
  "app/(public)/apt/[id]/_components/property-header.tsx" \
  "app/(public)/apt/[id]/_components/stats-cards.tsx" \
  "app/(public)/apt/[id]/_components/transaction-section.tsx" \
  "app/(public)/apt/[id]/_components/nearby-properties.tsx" \
  "app/(public)/apt/[id]/_components/phase2-placeholder.tsx" \
  "app/(public)/apt/[id]/_components/static-map.tsx"
```

- [ ] **Step 2: Final TypeScript check — must be clean**

```bash
pnpm tsc --noEmit 2>&1 | grep -v node_modules | head -20
echo "TSC exit: $?"
```

Expected: TSC exit: 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy detail page components"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `/apt/<any-id>` renders hero banner + 2-column layout (main + sticky sidebar)
- [ ] 통합 거래 테이블 페이지네이션 동작 (다음 페이지 클릭 시 새 데이터 로드)
- [ ] 면적 데이터 없는 단지 → `AreaComparison` 렌더링되지 않음 (returns null)
- [ ] 주변 단지 없는 경우 → `NearbyPriceComparison` 렌더링되지 않음 (returns null)
- [ ] `/officetel/<id>`, `/villa/<id>` 동일 레이아웃 확인
- [ ] 사이드바 앵커 링크 클릭 시 해당 섹션으로 스크롤
- [ ] 모바일 뷰 (`lg:` 이하) → 단일 컬럼으로 fallback
