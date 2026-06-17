import Link from 'next/link';
import { SourceCaption } from '@/components/ui/source-caption';
import { SubscriptionBoardItem } from '@/app/(public)/_components/subscription-board-item';
import type { LoanDiscovery } from '@/lib/loan/discovery';

export function LoanDiscoverySection({ discovery }: { discovery: LoanDiscovery }) {
  const { regionScope, popularRegions, weeklySubscriptions } = discovery;
  const hasRegions = popularRegions.length > 0;
  const hasSubs = weeklySubscriptions.length > 0;
  if (!hasRegions && !hasSubs) return null;

  const moreHref = regionScope.sido ? `/list?sido=${encodeURIComponent(regionScope.sido)}` : '/list';

  return (
    <section className="mt-10 rounded-[22px] bg-[var(--color-soft)] p-6">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">임장온에서 더 살펴보기</h2>

      {hasRegions && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--color-text)]">{regionScope.label} 인기 지역</h3>
            <Link href={moreHref} className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
              실거래가 더 보기 →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularRegions.map((r) => (
              <Link
                key={r.sigunguCode}
                href={`/list?sido=${encodeURIComponent(r.sido)}&region=${encodeURIComponent(r.sigunguCode)}`}
                className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] transition hover:border-[var(--color-blue)]"
              >
                {r.sigungu}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasRegions && <div className="my-5 border-t border-[var(--color-line)]" />}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text)]">이번 주 청약</h3>
          <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
            전체 청약 →
          </Link>
        </div>
        {hasSubs ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {weeklySubscriptions.map((item) => (
              <SubscriptionBoardItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-[var(--color-muted)]">이번 주 예정된 청약이 없습니다.</p>
        )}
      </div>

      <div className="mt-5">
        <SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub']} />
      </div>
    </section>
  );
}
