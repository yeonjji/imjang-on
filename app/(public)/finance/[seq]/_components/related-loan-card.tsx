import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { RelatedLoan } from '@/lib/loan/related';

export function RelatedLoanCard({ item }: { item: RelatedLoan }) {
  return (
    <Link href={`/finance/${item.seq}`} className="block">
      <article className="h-full rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow-soft)] transition hover:shadow-lg">
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
        <p className="text-sm text-[var(--color-muted)]">{item.summaryLine}</p>
        {item.irt && <p className="mt-1 text-sm text-[var(--color-muted)]">금리 {item.irt}</p>}
        {item.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.reasons.map((r) => (
              <Badge key={r.label} tone="blue">
                {r.label}
              </Badge>
            ))}
          </div>
        )}
      </article>
    </Link>
  );
}
