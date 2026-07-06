import Link from 'next/link';
import type { WeekModel } from '@/lib/subscription';
import { WeeklyBoardGantt } from './weekly-board-gantt';
import { WeeklyBoardMobile } from './weekly-board-mobile';
import { SourceCaption } from '@/components/ui/source-caption';

function SummaryHeader({ summary }: { summary: WeekModel['summary'] }) {
  const cards = [
    { n: summary.open, label: '진행중', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    { n: summary.upcoming, label: '예정', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
    { n: summary.closed, label: '마감', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
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

export function WeeklySubscriptionBoard({ board }: { board: WeekModel }) {
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
          <SummaryHeader summary={board.summary} />
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
          <WeeklyBoardMobile days={board.days} />
          <WeeklyBoardGantt days={board.days} bars={board.bars} />
        </>
      )}

      <SourceCaption ids={['applyhome', 'lh-presub']} />
    </section>
  );
}
