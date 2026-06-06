import Link from 'next/link';
import type { WeeklyBoard, WeeklyBoardDay } from '@/lib/subscription';
import { SubscriptionBoardItem } from './subscription-board-item';

function formatMd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function SummaryHeader({ board }: { board: WeeklyBoard }) {
  const cards = [
    { n: board.summary.open, label: '진행중', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    { n: board.summary.upcoming, label: '예정', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
    { n: board.summary.closed, label: '마감', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  ];
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl px-3 py-3 ring-1 ${c.cls}`}>
          <strong className="block text-2xl font-black leading-none">{c.n}</strong>
          <span className="mt-1.5 flex items-center gap-1 text-xs font-bold">
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayItems({ day }: { day: WeeklyBoardDay }) {
  if (day.items.length === 0) {
    return <p className="text-xs font-medium text-slate-300">청약 일정 없음</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {day.items.map((item) => (
        <SubscriptionBoardItem key={item.id} item={item} />
      ))}
      {day.overflow > 0 && (
        <Link href="/subscription" className="text-xs font-bold text-[var(--color-blue)]">
          +{day.overflow}건 더보기
        </Link>
      )}
    </div>
  );
}

export function WeeklySubscriptionBoard({ board }: { board: WeeklyBoard }) {
  return (
    <section className="mt-10">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]"><span aria-hidden>📅</span> 이번주 청약</p>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
            이번 주 청약을 한눈에
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            {formatMd(board.weekStart)} – {formatMd(board.weekEnd)} · 진행중·예정·마감 일정
          </p>
        </div>
        <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
          전체 보기 →
        </Link>
      </div>

      <SummaryHeader board={board} />

      {board.total === 0 ? (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--color-muted)]">이번 주 등록된 청약이 없습니다.</p>
          <Link href="/subscription" className="mt-2 inline-block text-sm font-bold text-[var(--color-blue)]">
            전체 청약 일정 보기 →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            {board.days.map((day) => (
              <div
                key={day.weekday}
                className={`flex gap-3 rounded-2xl border bg-white px-3 py-2.5 ${
                  day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
                }`}
              >
                <div className="w-10 shrink-0">
                  <strong className="block text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
                  <span className="block text-[10px] font-medium text-[var(--color-muted)]">{formatMd(day.date)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <DayItems day={day} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden grid-cols-7 gap-2.5 md:grid">
            {board.days.map((day) => (
              <div
                key={day.weekday}
                className={`flex min-h-[150px] flex-col rounded-2xl border bg-white p-3 ${
                  day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
                }`}
              >
                <div className="mb-2.5 border-b border-[var(--color-line)] pb-2">
                  <strong className="block text-sm font-black text-[var(--color-blue-dark)]">
                    {day.weekday} {formatMd(day.date)}
                  </strong>
                  {day.isToday && <span className="text-[10px] font-bold text-[var(--color-blue)]">오늘</span>}
                </div>
                <div className="flex-1">
                  <DayItems day={day} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
