import Link from 'next/link';
import type { LoanSummary } from '@/lib/loan/list';

export function LoanCard({ item }: { item: LoanSummary }) {
  return (
    <Link
      href={`/finance/${item.seq}`}
      className="block rounded-lg border border-[var(--color-line)] p-4 transition hover:border-[var(--color-blue)]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-bold text-[var(--color-text)]">{item.finprdnm}</span>
        {item.lnlmt != null && (
          <span className="shrink-0 text-sm tabular-nums text-[var(--color-blue-dark)]">
            한도 {item.lnlmt.toLocaleString()}만원
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-[var(--color-muted)]">
        {item.ofrinstnm ?? '—'}
        {item.instCtg ? ` · ${item.instCtg}` : ''}
        {item.irt ? ` · 금리 ${item.irt}` : ''}
      </p>
      <div className="flex flex-wrap gap-1">
        {item.usageTags.map((t) => (
          <span key={t} className="rounded bg-[var(--color-soft)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
