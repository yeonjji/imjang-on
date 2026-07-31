import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { targetLabels } from '@/lib/loan/categories';
import type { LoanSummary } from '@/lib/loan/list';

export function LoanCard({ item }: { item: LoanSummary }) {
  const targets = targetLabels(item.targetTags);
  const regions = item.regionTags.filter((r) => r !== '전국');
  const hasSub = targets.length > 0 || regions.length > 0;
  return (
    <Link href={`/finance/${item.seq}`} className="block h-full">
      <article className="flex h-full flex-col rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow-soft)] transition hover:shadow-lg">
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
        <p className="text-sm text-[var(--color-muted)]">
          {item.ofrinstnm ?? '—'}
          {item.instCtg ? ` · ${item.instCtg}` : ''}
          {item.irt ? ` · 금리 ${item.irt}` : ''}
        </p>
        {hasSub && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {targets.length > 0 && (
              <>
                <span className="font-semibold">대상</span> {targets.slice(0, 2).join('·')}
                {targets.length > 2 ? ' 외' : ''}
              </>
            )}
            {targets.length > 0 && regions.length > 0 ? ' · ' : ''}
            {regions.length > 0
              ? `${regions.slice(0, 2).join('·')}${regions.length > 2 ? ' 외' : ''}`
              : ''}
          </p>
        )}
        {item.operPeriod && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            <span className="font-semibold">운영기간</span> · {item.operPeriod}
          </p>
        )}
        {item.usageTags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
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
