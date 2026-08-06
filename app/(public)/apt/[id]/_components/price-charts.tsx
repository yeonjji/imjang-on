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
import { deriveRangeStats, toChartRows } from '@/lib/price-chart';
import type { AreaSummaryItem, ChartData, LatestTransaction } from '@/lib/transaction';

const DEALS: { key: DealType; label: string; color: string }[] = [
  { key: 'SALE', label: '매매', color: '#2563eb' },
  { key: 'JEONSE', label: '전세', color: '#0f9f6e' },
  { key: 'WOLSE', label: '월세 보증금', color: '#ef4444' },
];

/** 'YYYY-MM' → "'YY.MM" */
function fmtMonth(m: string): string {
  return `'${m.slice(2, 4)}.${m.slice(5, 7)}`;
}

interface Props {
  data: ChartData;
  /** 거래유형별 최근 실거래 1건. 헤드라인 수치는 평형이 섞인 월평균이 아니라 이걸 쓴다. */
  latest: Partial<Record<DealType, LatestTransaction>>;
  /** 평형이 일치하는 변동률(표본 2건 가드)의 출처. 매매에만 존재한다. */
  areaSummary: AreaSummaryItem[];
}

export function PriceCharts({ data, latest, areaSummary }: Props) {
  const [deal, setDeal] = useState<DealType>('SALE');

  if (DEALS.every((d) => (data[d.key]?.length ?? 0) === 0)) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-muted)]">실거래 데이터가 없습니다.</p>
      </Card>
    );
  }

  const points = data[deal] ?? [];
  const stats = deriveRangeStats(points);
  const rows = toChartRows(points);
  const color = DEALS.find((d) => d.key === deal)!.color;
  const lastIdx = rows.length - 1;
  const last = latest[deal];
  // 평형 보정 변동률은 매매 기준으로만 계산돼 있다(getAreaSummary). 최근 실거래와 같은 평형일 때만 쓴다.
  const areaTrend =
    deal === 'SALE' && last ? areaSummary.find((a) => a.area === last.pyeong) ?? null : null;
  const trendPct = areaTrend?.changePct12m ?? null;

  return (
    <Card>
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
          {/* 헤더 숫자 — 평형이 섞인 월평균이 아니라 실제 거래 1건 */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-bold text-[var(--color-muted)]">최근 실거래</span>
            <span className="text-3xl font-black text-[var(--color-blue-dark)]">
              {last ? formatBillion(last.amountManwon) : '-'}
            </span>
          </div>
          {last && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {last.pyeong}평{last.floor != null && ` · ${last.floor}층`} · {last.contractDate.replace(/-/g, '.')}
            </p>
          )}

          {/* 변동률은 평형이 일치하고 표본이 2건 이상일 때만 (getAreaSummary 기준) */}
          {trendPct !== null && areaTrend ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-bold text-[var(--color-muted)]">
                {areaTrend.area}평 12개월 변동
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                  trendPct >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                }`}
              >
                {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(1)}%
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">
                표본 {areaTrend.count12m}건 · 직전 12개월 평균 대비
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--color-muted)]">
              같은 평형 표본이 부족해 변동률은 표시하지 않습니다.
            </p>
          )}

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
                  width={60}
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
                  dot={({ key, ...props }) => (
                    <EndDot key={key} {...props} color={color} lastIdx={lastIdx} />
                  )}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
              진한 선 = 월평균(전 평형) · 옅은 음영 = 그 달의 최고~최저 거래 범위.
              평형을 구분하지 않은 평균이라 평형 구성이 달라지면 선도 함께 움직입니다.
            </p>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          해당 유형의 거래 데이터가 없습니다.
        </p>
      )}

      {/* 비교 스트립 — 유형별 최근 실거래 1건(평형 병기). 여기서도 월평균을 쓰지 않는다. */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-[var(--color-line)] pt-4">
        {DEALS.map((d) => {
          const l = latest[d.key];
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
                {l ? formatBillion(l.amountManwon) : '-'}
              </span>
              {l && (
                <span className="ml-1 text-[11px] text-[var(--color-muted)]">{l.pyeong}평</span>
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
  if (index !== lastIdx || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />;
}
