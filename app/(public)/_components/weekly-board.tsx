'use client';

import { useState } from 'react';
import { SubscriptionBoardItem } from './subscription-board-item';
import { cn } from '@/lib/cn';
import type { WeekModelDay } from '@/lib/subscription';

// 반응형 단일 셀: 모바일=라벨 왼쪽 행, PC(md↑)=라벨 위 열.
// PC/모바일 각각 렌더하던 두 컴포넌트를 하나로 합쳐 DOM 중복·이중 하이드레이션 제거.
function DayCell({ day, perDay }: { day: WeekModelDay; perDay: number }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, day.items.length - perDay);
  const visible = expanded ? day.items : day.items.slice(0, perDay);

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border bg-white px-3 py-2.5 md:flex-col md:gap-0 md:p-2',
        day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]',
      )}
    >
      <div className="flex w-12 shrink-0 flex-col md:mb-2 md:w-auto md:flex-row md:items-center md:gap-1 md:px-1">
        <strong className="text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
        <span className="text-xs font-medium text-[var(--color-muted)]">{day.md}</span>
        {day.isToday && (
          <span className="mt-1 inline-block rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white md:ml-auto md:mt-0">
            TODAY
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 md:flex-none">
        {day.items.length === 0 ? (
          <p className="text-sm font-medium text-[var(--color-muted)] md:text-xs">청약 일정 없음</p>
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

export function WeeklyBoard({ days, perDay = 4 }: { days: WeekModelDay[]; perDay?: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
      {days.map((day, i) => (
        <DayCell key={i} day={day} perDay={perDay} />
      ))}
    </div>
  );
}
