import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { LoanSummary } from '@/lib/loan/list';

export function LoanCard({ item }: { item: LoanSummary }) {
  return (
    <Link href={`/finance/${item.seq}`} className="block">
      <article className="rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow-soft)] transition hover:shadow-lg">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="break-keep text-lg font-bold text-[var(--color-blue-dark)]">
            {item.finprdnm}
          </h3>
          {item.lnlmt != null && (
            <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--color-blue)]">
              한도 {item.lnlmt.toLocaleString()}만원
            </span>
          )}
        </div>
        <p className={`text-sm text-[var(--color-muted)] ${item.operPeriod ? 'mb-1' : 'mb-3'}`}>
          {item.ofrinstnm ?? '—'}
          {item.instCtg ? ` · ${item.instCtg}` : ''}
          {item.irt ? ` · 금리 ${item.irt}` : ''}
        </p>
        {item.operPeriod && (
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            <span className="font-semibold">운영기간</span> · {item.operPeriod}
          </p>
        )}
        {item.usageTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.usageTags.map((t) => (
              <Badge key={t} tone="blue">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </article>
    </Link>
  );
}
