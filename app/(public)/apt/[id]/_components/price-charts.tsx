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
  if (index !== lastIdx || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />;
}
