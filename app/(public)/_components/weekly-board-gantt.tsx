'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { WeekModelDay, WeekBar } from '@/lib/subscription';

const BAR_TONE: Record<WeekBar['tone'], string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  blue: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)] ring-sky-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function WeeklyBoardGantt({
  days,
  bars,
  initialVisible = 6,
}: {
  days: WeekModelDay[];
  bars: WeekBar[];
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, bars.length - initialVisible);
  const visible = expanded ? bars : bars.slice(0, initialVisible);

  return (
    <div className="hidden md:block">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-px border-b border-[var(--color-line)] pb-2">
        {days.map((d, i) => (
          <div key={i} className="flex items-center gap-1 px-1 text-xs font-bold text-[var(--color-blue-dark)]">
            <span>{d.weekday}</span>
            <span className="font-medium text-[var(--color-muted)]">{d.md}</span>
            {d.isToday && (
              <span className="rounded-full bg-[var(--color-blue-dark)] px-1 py-0.5 text-[10px] font-black leading-none text-white">
                오늘
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 막대 영역 (오늘 컬럼 하이라이트 배경 + 막대 행) */}
      <div className="relative pt-2">
        <div className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-px">
          {days.map((d, i) => (
            <div key={i} className={d.isToday ? 'rounded-md bg-[var(--color-soft)]' : ''} />
          ))}
        </div>

        <div className="relative flex flex-col gap-1.5">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm font-medium text-[var(--color-muted)]">청약 일정 없음</p>
          )}
          {visible.map((bar) => (
            <div key={bar.id} className="grid grid-cols-7 gap-px">
              <Link
                href={`/subscription/${bar.id}`}
                style={{ gridColumn: `${bar.startIdx + 1} / ${bar.endIdx + 2}` }}
                className={cn(
                  'flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold ring-1 transition hover:brightness-95',
                  BAR_TONE[bar.tone],
                )}
              >
                {bar.startsBeforeWeek && <span className="shrink-0 opacity-60">◀</span>}
                <span className="min-w-0 flex-1 truncate">{bar.name}</span>
                {bar.todayDdayLabel && (
                  <span className="shrink-0 rounded bg-white/70 px-1 text-[11px] font-black leading-tight">
                    {bar.todayDdayLabel}
                  </span>
                )}
                {bar.endsAfterWeek && <span className="shrink-0 opacity-60">▶</span>}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold text-[var(--color-blue)]"
        >
          {expanded ? '접기 ↑' : `+${overflow}건 더보기 ↓`}
        </button>
      )}
    </div>
  );
}
