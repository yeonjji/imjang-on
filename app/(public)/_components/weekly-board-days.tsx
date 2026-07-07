'use client';

import { useState } from 'react';
import { SubscriptionBoardItem } from './subscription-board-item';
import type { WeekModelDay } from '@/lib/subscription';

function DayRow({ day, perDay }: { day: WeekModelDay; perDay: number }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, day.items.length - perDay);
  const visible = expanded ? day.items : day.items.slice(0, perDay);

  return (
    <div
      className={`flex gap-3 rounded-2xl border bg-white px-3 py-2.5 ${
        day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
      }`}
    >
      <div className="w-12 shrink-0">
        <strong className="block text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
        <span className="block text-xs font-medium text-[var(--color-muted)]">{day.md}</span>
        {day.isToday && (
          <span className="mt-1 inline-block rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            TODAY
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {day.items.length === 0 ? (
          <p className="text-sm font-medium text-[var(--color-muted)]">청약 일정 없음</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((item) => (
              <SubscriptionBoardItem key={item.id} item={item} />
            ))}
            {overflow > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="text-left text-xs font-bold text-[var(--color-blue)]"
              >
                {expanded ? '접기 ↑' : `+${overflow}건 더보기 ↓`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeeklyBoardDays({ days, perDay = 3 }: { days: WeekModelDay[]; perDay?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {days.map((day, i) => (
        <DayRow key={i} day={day} perDay={perDay} />
      ))}
    </div>
  );
}
