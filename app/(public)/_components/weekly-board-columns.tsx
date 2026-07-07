'use client';

import { useState } from 'react';
import { SubscriptionBoardItem } from './subscription-board-item';
import { cn } from '@/lib/cn';
import type { WeekModelDay } from '@/lib/subscription';

function DayColumn({ day, perDay }: { day: WeekModelDay; perDay: number }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, day.items.length - perDay);
  const visible = expanded ? day.items : day.items.slice(0, perDay);

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-white p-2',
        day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]',
      )}
    >
      <div className="mb-2 flex items-center gap-1 px-1">
        <strong className="text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
        <span className="text-xs font-medium text-[var(--color-muted)]">{day.md}</span>
        {day.isToday && (
          <span className="ml-auto rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            TODAY
          </span>
        )}
      </div>
      {day.items.length === 0 ? (
        <p className="px-1 py-2 text-xs font-medium text-[var(--color-muted)]">일정 없음</p>
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
              {expanded ? '접기 ↑' : `+${overflow}건 ↓`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function WeeklyBoardColumns({ days, perDay = 4 }: { days: WeekModelDay[]; perDay?: number }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => (
        <DayColumn key={i} day={day} perDay={perDay} />
      ))}
    </div>
  );
}
