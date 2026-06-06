# 실거래가 가격 흐름 그래프 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트 상세의 "가격 흐름 그래프"를, 평형 선택 + 매매/전세/월세 탭 + 풀세트 숫자 헤더 + 격자·축·면적채움·최고/최저 음영밴드를 갖춘 단일 큰 그래프 + 3유형 비교 스트립으로 재구성한다.

**Architecture:** 순수 통계 계산 로직(`lib/price-chart.ts`)은 TDD로, DB 집계(`lib/transaction.ts`)는 평형·min/max 확장 후 typecheck/e2e로, UI(`price-charts.tsx`)는 recharts `ComposedChart`로 재작성한다. 모든 전환은 클라이언트 상태이며 재요청이 없다.

**Tech Stack:** Next.js 15 (서버 컴포넌트 + `'use client'` 차트), recharts 2.15.4, Prisma raw SQL(Postgres), vitest, Playwright, Tailwind v4 + CSS 변수.

설계 문서: `docs/superpowers/specs/2026-06-06-price-chart-redesign-design.md`

---

## File Structure

- **Create** `lib/price-chart.ts` — 순수 타입 + 통계 파생/변환 헬퍼 (DB·React 의존 없음, 단위 테스트 대상)
- **Create** `tests/lib/price-chart.test.ts` — 위 헬퍼의 단위 테스트
- **Modify** `lib/transaction.ts` — `getMonthlyChartData`를 평형·min/max 집계로 확장, 반환 타입 변경
- **Rewrite** `app/(public)/apt/[id]/_components/price-charts.tsx` — 새 UI
- **Modify** `app/(public)/apt/[id]/page.tsx:92` — `PriceCharts` props 전달 변경(1줄)
- **Modify** `tests/e2e/apt-detail.spec.ts` — 차트 섹션 스모크 + 탭 전환 추가

타입 흐름: `MonthPoint`는 `lib/price-chart.ts`에 정의 → `lib/transaction.ts`가 import. 순환 없음(price-chart는 transaction을 import하지 않음).

---

## Task 1: 순수 통계 헬퍼 (`lib/price-chart.ts`) — TDD

**Files:**
- Create: `lib/price-chart.ts`
- Test: `tests/lib/price-chart.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/price-chart.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  monthDiff,
  deriveHeaderStats,
  toChartRows,
  pickDefaultPyeong,
  type MonthPoint,
} from '@/lib/price-chart';

const mp = (month: string, avg: number, min = avg, max = avg, count = 1): MonthPoint => ({
  month,
  avg,
  min,
  max,
  count,
});

describe('monthDiff', () => {
  it('YYYY-MM 두 개의 개월 차이', () => {
    expect(monthDiff('2025-03', '2026-03')).toBe(12);
    expect(monthDiff('2025-10', '2026-03')).toBe(5);
    expect(monthDiff('2026-03', '2026-03')).toBe(0);
  });
});

describe('deriveHeaderStats', () => {
  it('빈 배열이면 null', () => {
    expect(deriveHeaderStats([])).toBeNull();
  });

  it('단일 포인트면 변동률 null, 개월 0', () => {
    const s = deriveHeaderStats([mp('2026-03', 1000, 900, 1100, 2)]);
    expect(s).not.toBeNull();
    expect(s!.current).toBe(1000);
    expect(s!.changePct).toBeNull();
    expect(s!.changeMonths).toBe(0);
    expect(s!.high).toBe(1100);
    expect(s!.low).toBe(900);
    expect(s!.count).toBe(2);
  });

  it('12개월 이상이면 12개월 전 대비 변동률', () => {
    const points: MonthPoint[] = [];
    for (let i = 0; i < 13; i++) {
      const m = `2025-${String(i + 3).padStart(2, '0')}`; // 2025-03 .. 2025-15→무효, 단순화 위해 아래 재정의
    }
    const pts = [
      mp('2025-03', 10000, 9500, 10500, 3),
      mp('2025-09', 11000, 10000, 12000, 5),
      mp('2026-03', 12000, 11000, 13000, 4),
    ];
    const s = deriveHeaderStats(pts)!;
    expect(s.current).toBe(12000);
    expect(s.changeMonths).toBe(12); // 2025-03 기준
    expect(s.changePct).toBeCloseTo(20, 5); // (12000-10000)/10000*100
    expect(s.high).toBe(13000);
    expect(s.low).toBe(9500);
    expect(s.count).toBe(12);
  });

  it('12개월 미만이면 가장 이른 달 기준으로 폴백', () => {
    const pts = [mp('2025-12', 8000), mp('2026-03', 8800)];
    const s = deriveHeaderStats(pts)!;
    expect(s.changeMonths).toBe(3);
    expect(s.changePct).toBeCloseTo(10, 5);
  });

  it('정렬되지 않은 입력도 처리', () => {
    const pts = [mp('2026-03', 12000), mp('2025-03', 10000)];
    const s = deriveHeaderStats(pts)!;
    expect(s.current).toBe(12000);
    expect(s.changeMonths).toBe(12);
  });
});

describe('toChartRows', () => {
  it('min/max를 band 튜플로 변환하고 월 오름차순 정렬', () => {
    const rows = toChartRows([mp('2026-03', 12000, 11000, 13000, 4), mp('2025-03', 10000, 9000, 11000, 3)]);
    expect(rows.map((r) => r.month)).toEqual(['2025-03', '2026-03']);
    expect(rows[0].band).toEqual([9000, 11000]);
    expect(rows[1].avg).toBe(12000);
  });
});

describe('pickDefaultPyeong', () => {
  it('거래 최다 평형을 반환', () => {
    expect(pickDefaultPyeong([{ pyeong: 25, totalCount: 72 }, { pyeong: 34, totalCount: 134 }])).toBe(34);
  });
  it('빈 배열이면 null', () => {
    expect(pickDefaultPyeong([])).toBeNull();
  });
});
```

> 주의: 위 첫 12개월 테스트의 죽은 루프는 제거하고 `pts` 배열만 사용한다 — 아래 Step 3 구현 후 정리.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:unit tests/lib/price-chart.test.ts`
Expected: FAIL — `Cannot find module '@/lib/price-chart'`

- [ ] **Step 3: 구현 작성 + 테스트의 죽은 루프 제거**

Create `lib/price-chart.ts`:

```ts
export interface MonthPoint {
  month: string; // 'YYYY-MM'
  avg: number; // 만원
  min: number;
  max: number;
  count: number;
}

export interface ChartRow {
  month: string;
  avg: number;
  band: [number, number]; // [min, max]
  count: number;
}

export interface HeaderStats {
  current: number;
  changePct: number | null;
  changeMonths: number;
  high: number;
  low: number;
  count: number;
}

/** 'YYYY-MM' 두 개의 개월 차이 (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function sortedByMonth(points: MonthPoint[]): MonthPoint[] {
  return [...points].sort((a, b) => a.month.localeCompare(b.month));
}

export function deriveHeaderStats(points: MonthPoint[]): HeaderStats | null {
  if (points.length === 0) return null;
  const sorted = sortedByMonth(points);
  const last = sorted[sorted.length - 1];
  const high = Math.max(...sorted.map((p) => p.max));
  const low = Math.min(...sorted.map((p) => p.min));
  const count = sorted.reduce((s, p) => s + p.count, 0);

  // 마지막 달로부터 ~12개월 전(target) 이하인 가장 최근 달을 기준점으로.
  const target = addMonths(last.month, -12);
  let baseIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].month <= target) baseIdx = i;
  }
  if (baseIdx < 0) baseIdx = 0; // 12개월 미만 → 가장 이른 달
  const baseline = sorted[baseIdx];
  const changeMonths = monthDiff(baseline.month, last.month);
  const changePct =
    baseline === last || baseline.avg === 0
      ? null
      : ((last.avg - baseline.avg) / baseline.avg) * 100;

  return { current: last.avg, changePct, changeMonths, high, low, count };
}

export function toChartRows(points: MonthPoint[]): ChartRow[] {
  return sortedByMonth(points).map((p) => ({
    month: p.month,
    avg: p.avg,
    band: [p.min, p.max],
    count: p.count,
  }));
}

export function pickDefaultPyeong(
  areas: { pyeong: number; totalCount: number }[],
): number | null {
  if (areas.length === 0) return null;
  return areas.reduce((best, a) => (a.totalCount > best.totalCount ? a : best)).pyeong;
}
```

그리고 `tests/lib/price-chart.test.ts`의 12개월 테스트에서 죽은 `for` 루프(`const m = ...`)를 삭제한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:unit tests/lib/price-chart.test.ts`
Expected: PASS (모든 it 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/price-chart.ts tests/lib/price-chart.test.ts
git commit -m "feat(chart): 가격 차트 통계 파생 헬퍼 + 단위 테스트"
```

---

## Task 2: 데이터 레이어 — 평형·min/max 집계 (`lib/transaction.ts`)

**Files:**
- Modify: `lib/transaction.ts` (`getMonthlyChartData`, 33-59행)

- [ ] **Step 1: import에 MonthPoint 타입 추가**

`lib/transaction.ts` 최상단 import 구역(2행 근처)에 추가:

```ts
import type { MonthPoint } from '@/lib/price-chart';
```

- [ ] **Step 2: 반환 타입 추가 + 함수 교체**

`lib/transaction.ts`의 기존 `getMonthlyChartData`(33-59행) 전체를 아래로 교체:

```ts
export interface AreaSeries {
  pyeong: number;
  totalCount: number;
  series: Record<DealType, MonthPoint[]>;
}
export type ChartData = AreaSeries[];

export async function getMonthlyChartData(propertyId: bigint): Promise<ChartData> {
  const rows = await prisma.$queryRaw<
    Array<{
      pyeong: number;
      month: Date;
      deal_type: DealType;
      avg_value: number | null;
      min_value: number | null;
      max_value: number | null;
      cnt: number;
    }>
  >`
    SELECT
      ROUND("exclusiveArea"::numeric / 3.3057851239669422)::int AS pyeong,
      DATE_TRUNC('month', "contractDate")::date AS month,
      "dealType" AS deal_type,
      AVG(val)::float AS avg_value,
      MIN(val)::float AS min_value,
      MAX(val)::float AS max_value,
      COUNT(*)::int AS cnt
    FROM (
      SELECT
        "exclusiveArea",
        "contractDate",
        "dealType",
        CASE WHEN "dealType" = 'SALE' THEN "dealAmount" ELSE "deposit" END AS val
      FROM "Transaction"
      WHERE "propertyId" = ${propertyId}
        AND "contractDate" >= NOW() - INTERVAL '24 months'
    ) t
    WHERE val IS NOT NULL
    GROUP BY 1, 2, 3
    ORDER BY 1 ASC, 2 ASC
  `;

  const byPyeong = new Map<number, AreaSeries>();
  for (const r of rows) {
    if (r.avg_value === null || r.min_value === null || r.max_value === null) continue;
    let area = byPyeong.get(r.pyeong);
    if (!area) {
      area = { pyeong: r.pyeong, totalCount: 0, series: { SALE: [], JEONSE: [], WOLSE: [] } };
      byPyeong.set(r.pyeong, area);
    }
    area.series[r.deal_type].push({
      month: r.month.toISOString().slice(0, 7),
      avg: r.avg_value,
      min: r.min_value,
      max: r.max_value,
      count: r.cnt,
    });
    area.totalCount += r.cnt;
  }

  return [...byPyeong.values()].sort((a, b) => b.totalCount - a.totalCount);
}
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS (page.tsx는 다음 Task에서 props를 맞추므로, 이 단계에서 page.tsx 타입 오류가 나면 Task 4까지 진행 후 함께 통과 — 단독 실행 시 `chart.SALE` 참조 오류가 예상됨)

> 참고: 이 Task 이후 `page.tsx`의 `chart.SALE`/`chart.JEONSE`/`chart.WOLSE` 참조가 깨진다. Task 4에서 수정한다. 커밋은 Task 4와 함께(컴파일 가능한 상태 유지).

- [ ] **Step 4: (커밋 보류)** — Task 3·4 완료 후 함께 커밋

---

## Task 3: UI 재작성 (`price-charts.tsx`)

**Files:**
- Rewrite: `app/(public)/apt/[id]/_components/price-charts.tsx`

- [ ] **Step 1: 컴포넌트 전체 교체**

`app/(public)/apt/[id]/_components/price-charts.tsx` 전체를 아래로 교체:

```tsx
'use client';

import { useState } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DealType } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import { deriveHeaderStats, toChartRows, pickDefaultPyeong } from '@/lib/price-chart';
import type { ChartData } from '@/lib/transaction';

const DEALS: { key: DealType; label: string; color: string }[] = [
  { key: 'SALE', label: '매매', color: '#2563eb' },
  { key: 'JEONSE', label: '전세', color: '#0f9f6e' },
  { key: 'WOLSE', label: '월세 보증금', color: '#ef4444' },
];

/** 'YYYY-MM' → "'YY.MM" */
function fmtMonth(m: string): string {
  return `'${m.slice(2, 4)}.${m.slice(5, 7)}`;
}

export function PriceCharts({ data }: { data: ChartData }) {
  const defaultPyeong = pickDefaultPyeong(data);
  const [pyeong, setPyeong] = useState<number | null>(defaultPyeong);
  const [deal, setDeal] = useState<DealType>('SALE');

  if (data.length === 0 || defaultPyeong === null) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-muted)]">실거래 데이터가 없습니다.</p>
      </Card>
    );
  }

  const area = data.find((a) => a.pyeong === pyeong) ?? data[0];
  const points = area.series[deal] ?? [];
  const stats = deriveHeaderStats(points);
  const rows = toChartRows(points);
  const color = DEALS.find((d) => d.key === deal)!.color;
  const lastIdx = rows.length - 1;

  return (
    <Card>
      {/* 평형 선택칩 */}
      {data.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {data.map((a) => (
            <button
              key={a.pyeong}
              onClick={() => setPyeong(a.pyeong)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                a.pyeong === area.pyeong
                  ? 'bg-[var(--color-blue-dark)] text-white'
                  : 'bg-[var(--color-soft)] text-[var(--color-muted)]'
              }`}
            >
              {a.pyeong}평 <span className="font-medium opacity-70">{a.totalCount}건</span>
            </button>
          ))}
        </div>
      )}

      {/* 유형 탭 */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {DEALS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDeal(d.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${
              d.key === deal ? 'bg-[#2563eb] text-white' : 'bg-[var(--color-soft)] text-[var(--color-muted)]'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {stats ? (
        <>
          {/* 헤더 숫자 */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-bold text-[var(--color-muted)]">현재 시세</span>
            <span className="text-3xl font-black text-[var(--color-blue-dark)]">
              {formatBillion(stats.current)}
            </span>
            {stats.changePct === null ? (
              <span className="text-xs text-[var(--color-muted)]">변동 정보 없음</span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                  stats.changePct >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                }`}
              >
                {stats.changePct >= 0 ? '▲' : '▼'} {Math.abs(stats.changePct).toFixed(1)}%{' '}
                <span className="font-semibold">최근 {stats.changeMonths}개월</span>
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Stat k="최고가" v={formatBillion(stats.high)} />
            <Stat k="최저가" v={formatBillion(stats.low)} />
            <Stat k="거래건수" v={`${stats.count}건`} />
            <Stat k="최근 거래" v={points[points.length - 1].month.replace('-', '.')} />
          </div>

          {/* 그래프 */}
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`avgGrad-${deal}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  interval="preserveStartEnd"
                  minTickGap={48}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatBillion(Number(v))}
                  width={46}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin', 'dataMax']}
                />
                <Tooltip
                  labelFormatter={(m) => fmtMonth(String(m))}
                  formatter={(val: unknown, name) =>
                    name === 'avg' ? [formatBillion(Number(val)), '평균'] : [null, null]
                  }
                />
                <Area
                  dataKey="band"
                  stroke="none"
                  fill={color}
                  fillOpacity={0.08}
                  isAnimationActive={false}
                />
                <Area
                  dataKey="avg"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#avgGrad-${deal})`}
                  isAnimationActive={false}
                  dot={(props) => <EndDot {...props} color={color} lastIdx={lastIdx} />}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
              진한 선 = 월평균 · 옅은 음영 = 그 달의 최고~최저 거래 범위
            </p>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          해당 평형·유형의 거래 데이터가 없습니다.
        </p>
      )}

      {/* 비교 스트립 */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-[var(--color-line)] pt-4">
        {DEALS.map((d) => {
          const s = deriveHeaderStats(area.series[d.key] ?? []);
          const on = d.key === deal;
          return (
            <button
              key={d.key}
              onClick={() => setDeal(d.key)}
              className={`rounded-xl border p-2.5 text-left ${
                on ? 'border-[#2563eb] bg-[var(--color-sky-soft)]' : 'border-transparent bg-[var(--color-soft)]'
              }`}
            >
              <p className="text-xs font-semibold text-[var(--color-muted)]">{d.label}</p>
              <span className="text-sm font-black text-[var(--color-blue-dark)]">
                {s ? formatBillion(s.current) : '-'}
              </span>{' '}
              {s?.changePct != null && (
                <span
                  className={`text-[11px] font-extrabold ${
                    s.changePct >= 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {s.changePct >= 0 ? '▲' : '▼'}
                  {Math.abs(s.changePct).toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-2.5 py-1.5">
      <span className="block text-[11px] font-bold text-[var(--color-muted)]">{k}</span>
      <span className="text-sm font-black text-[var(--color-blue-dark)]">{v}</span>
    </div>
  );
}

function EndDot(props: { cx?: number; cy?: number; index?: number; color: string; lastIdx: number }) {
  const { cx, cy, index, color, lastIdx } = props;
  if (index !== lastIdx || cx == null || cy == null) return <g />;
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />;
}
```

- [ ] **Step 2: 타입 체크 (page.tsx 제외 오류 무시)**

Run: `pnpm typecheck`
Expected: page.tsx의 `PriceCharts sale=... ` props 오류만 남음(Task 4에서 해결). 그 외 price-charts.tsx/transaction.ts/price-chart.ts 오류 없음.

---

## Task 4: 페이지 배선 (`page.tsx`)

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx:92`

- [ ] **Step 1: PriceCharts 호출 교체**

`app/(public)/apt/[id]/page.tsx` 92행:

```tsx
            <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
```

를 아래로 교체:

```tsx
            <PriceCharts data={chart} />
```

(`chart`는 이미 `getMonthlyChartData(propId)` 결과로 54-66행 `Promise.all`에서 가져옴 — 추가 변경 불필요.)

- [ ] **Step 2: 타입 체크 + 린트 통과 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (오류 0)

- [ ] **Step 3: 빌드로 차트 컴파일 확인**

Run: `pnpm build`
Expected: 빌드 성공 (recharts SSR/CSR 경계 오류 없음)

- [ ] **Step 4: 커밋 (Task 2·3·4 묶음)**

```bash
git add lib/transaction.ts app/\(public\)/apt/\[id\]/_components/price-charts.tsx app/\(public\)/apt/\[id\]/page.tsx
git commit -m "feat(chart): 평형 선택·탭·통계 헤더·음영밴드 가격 그래프로 재구성"
```

---

## Task 5: e2e 스모크 — 차트 섹션 + 탭 전환

**Files:**
- Modify: `tests/e2e/apt-detail.spec.ts`

- [ ] **Step 1: 실패하는 e2e 테스트 추가**

`tests/e2e/apt-detail.spec.ts` 맨 끝(42행 이후)에 추가:

```ts
test('apt detail: 가격 흐름 그래프 — 헤더 숫자 + 유형 탭 전환', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/apt/${propertyId}`);

  const chart = page.locator('#chart');
  await expect(chart.getByRole('heading', { name: '가격 흐름 그래프' })).toBeVisible();

  // 헤더 풀세트 숫자
  await expect(chart.getByText('현재 시세')).toBeVisible();
  await expect(chart.getByText('최고가')).toBeVisible();
  await expect(chart.getByText('최저가')).toBeVisible();
  await expect(chart.getByText('거래건수')).toBeVisible();

  // recharts SVG 렌더 확인
  await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();

  // 전세 탭 전환 → 비교 스트립/탭 클릭 후에도 헤더 유지
  await chart.getByRole('button', { name: '전세', exact: true }).click();
  await expect(chart.getByText('현재 시세')).toBeVisible();
});

test('apt detail: 가격 그래프 모바일 폭 — 가로 오버플로우 없음', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/apt/${propertyId}`);

  const chart = page.locator('#chart');
  await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();

  // 문서 가로 스크롤(가로 오버플로우) 없어야 함
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm test:e2e tests/e2e/apt-detail.spec.ts`
Expected: 신규 2개 테스트 PASS (seed 단지 `래미안서초…`에 매매 거래 존재). 만약 "전세" 데이터가 시드에 없어 탭은 보이되 헤더가 "데이터 없음"이면, 단언을 `await expect(chart.getByText(/현재 시세|거래 데이터가 없습니다/)).toBeVisible()`로 완화.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/apt-detail.spec.ts
git commit -m "test(e2e): 가격 그래프 헤더·탭·모바일 오버플로우 스모크"
```

---

## Task 6: 시각·오버플로우 육안 검증

**Files:** 없음 (수동 검증)

- [ ] **Step 1: 개발 서버 실행 후 3개 뷰포트 확인**

Run: `pnpm dev` (background) 후 브라우저에서 `/apt/<id>` 접속.

확인 항목:
- 375px(모바일): 평형칩/탭 가로 스크롤 동작, 통계칩 2줄 래핑, 비교 스트립 3등분 안 깨짐, 가로 스크롤바 없음
- 768px(태블릿) / 1280px(데스크탑): 그래프가 본문 폭 100%로 시원하게, y축 금액·x축 월 눈금 노출, 음영 밴드 + 끝점 표시
- 평형칩/탭/비교카드 클릭 시 그래프·헤더 숫자 즉시 전환
- 매매/전세/월세 색상(파랑/초록/빨강) 정확

- [ ] **Step 2: 문제 발견 시 수정 후 재확인** — 없으면 완료

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** 탭/큰그래프/비교스트립(Task 3) · 풀세트 헤더(Task 3) · 격자/축/면적채움/끝점/음영밴드(Task 3) · 평형선택+기본값(Task 1 pickDefaultPyeong, Task 3) · min/max·평형 집계(Task 2) · 모바일/오버플로우(Task 3 클래스 + Task 5·6 검증) — 모두 매핑됨.
- **Placeholder 스캔:** Task 1 테스트의 죽은 루프는 Step 3에서 명시적으로 제거 지시(의도된 정리). 그 외 TBD/TODO 없음.
- **타입 일관성:** `MonthPoint`(price-chart.ts 정의 → transaction.ts import), `ChartData`/`AreaSeries`(transaction.ts → component import), `deriveHeaderStats`/`toChartRows`/`pickDefaultPyeong` 시그니처가 Task 1 정의와 Task 3 사용처 일치. `EndDot` props(cx/cy/index/color/lastIdx) 일관.
- **커밋 경계:** Task 2는 단독으로 page.tsx를 깨므로 Task 2·3·4를 한 커밋으로 묶어 항상 컴파일 가능한 상태 유지.
