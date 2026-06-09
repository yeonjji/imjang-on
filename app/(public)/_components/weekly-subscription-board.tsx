import Link from 'next/link';
import type { WeeklyBoard, WeeklyBoardDay } from '@/lib/subscription';
import { SubscriptionBoardItem } from './subscription-board-item';
import { SourceCaption } from '@/components/ui/source-caption';

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
    <div className="flex gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 ring-1 ${c.cls}`}>
          <strong className="text-lg font-black leading-none">{c.n}</strong>
          <span className="flex items-center gap-1 text-xs font-bold">
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
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-1 text-xl font-bold tracking-tight text-[var(--color-blue-dark)]">
            청약 일정을 한눈에
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            오늘 기준 전후 3일 · 진행중·예정·마감 일정
          </p>
        </div>
        <div className="flex items-center gap-3 md:flex-col md:items-end">
          <SummaryHeader board={board} />
          <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
            전체 보기 →
          </Link>
        </div>
      </div>

      {board.total === 0 ? (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--color-muted)]">표시할 청약 일정이 없습니다.</p>
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
                <div className="w-12 shrink-0">
                  <strong className="block text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
                  <span className="block text-xs font-medium text-[var(--color-muted)]">{formatMd(day.date)}</span>
                  {day.isToday && (
                    <span className="mt-1 inline-block rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                      TODAY
                    </span>
                  )}
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
                <div className="mb-2.5 flex items-center gap-1.5 border-b border-[var(--color-line)] pb-2">
                  <strong className="text-sm font-black text-[var(--color-blue-dark)]">
                    {day.weekday} {formatMd(day.date)}
                  </strong>
                  {day.isToday && (
                    <span className="rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                      TODAY
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <DayItems day={day} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SourceCaption ids={['applyhome', 'lh-presub']} />
    </section>
  );
}
