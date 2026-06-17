import { SourceCaption } from '@/components/ui/source-caption';
import type { RelatedLoan } from '@/lib/loan/related';
import { RelatedLoanCard } from './related-loan-card';

export function RelatedLoans({ items }: { items: RelatedLoan[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">함께 비교할 만한 상품</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <RelatedLoanCard key={item.seq} item={item} />
        ))}
      </div>
      <div className="mt-4">
        <SourceCaption ids={['kinfa-loan']} />
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          추천 순서는 임장온이 공개 태그(목적·대상·지역)로 산정했습니다.
        </p>
      </div>
    </section>
  );
}
