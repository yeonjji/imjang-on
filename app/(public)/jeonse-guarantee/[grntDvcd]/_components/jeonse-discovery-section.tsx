import Link from 'next/link';
import { SourceCaption } from '@/components/ui/source-caption';
import { SubscriptionBoardItem } from '@/app/(public)/_components/subscription-board-item';
import { RelatedLoanCard } from '@/app/(public)/finance/[seq]/_components/related-loan-card';
import { LifeGroupCards } from '@/app/(public)/_components/life-group-cards';
import { formatBillion } from '@/lib/format';
import type { MarketBriefing } from '@/lib/briefing';
import type { WeeklyBoardItem } from '@/lib/subscription';
import type { RelatedLoan } from '@/lib/loan/related';

interface Props {
  briefing: MarketBriefing | null;
  weeklySubscriptions: WeeklyBoardItem[];
  relatedLoans: RelatedLoan[];
}

/** 전세보증 상세 하단 '더 살펴보기' 디스커버리 섹션. 좌표 앵커가 없어 전국 기준 데이터만 노출. */
export function JeonseDiscoverySection({ briefing, weeklySubscriptions, relatedLoans }: Props) {
  const hasTx = briefing != null;
  const hasSubs = weeklySubscriptions.length > 0;
  const hasLoans = relatedLoans.length > 0;

  return (
    <section className="mt-10 rounded-[22px] bg-[var(--color-soft)] p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">임장ON에서 더 살펴보기</h2>

      {hasTx && (
        <DiscoveryBlock title="실거래가" moreHref="/list?deal=jeonse" moreLabel="전세 실거래가 더 보기 →">
          <TransactionTeaserCard briefing={briefing} />
        </DiscoveryBlock>
      )}

      {hasSubs && (
        <>
          {hasTx && <Divider />}
          <DiscoveryBlock title="이번 주 청약" moreHref="/subscription" moreLabel="전체 청약 →">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {weeklySubscriptions.map((item) => (
                <SubscriptionBoardItem key={item.id} item={item} />
              ))}
            </div>
          </DiscoveryBlock>
        </>
      )}

      {hasLoans && (
        <>
          {(hasTx || hasSubs) && <Divider />}
          <DiscoveryBlock title="다른 서민금융 대출상품" moreHref="/finance" moreLabel="서민금융 더 보기 →">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {relatedLoans.map((item) => (
                <RelatedLoanCard key={item.seq} item={item} />
              ))}
            </div>
          </DiscoveryBlock>
        </>
      )}

      <Divider />
      <DiscoveryBlock title="생활편의 둘러보기">
        <LifeGroupCards />
      </DiscoveryBlock>

      <div className="mt-5">
        <SourceCaption ids={['molit-rtms', 'applyhome', 'lh-presub', 'kinfa-loan']} />
      </div>
    </section>
  );
}

function Divider() {
  return <div className="my-5 border-t border-[var(--color-line)]" />;
}

function DiscoveryBlock({
  title,
  moreHref,
  moreLabel,
  children,
}: {
  title: string;
  moreHref?: string;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-[var(--color-text)]">{title}</h3>
        {moreHref && (
          <Link href={moreHref} className="shrink-0 py-1 text-xs font-bold text-[var(--color-blue)]">
            {moreLabel}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

/** 전국 매매 브리핑 요약(거래건수·최고가·인기지역)을 작은 타일로. */
function TransactionTeaserCard({ briefing }: { briefing: MarketBriefing }) {
  const { summary } = briefing;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <TxTile label="🧾 오늘 등록된 실거래" value={`${summary.txCount.toLocaleString('ko-KR')}건`} sub="전국 매매 신고분" />
      {summary.highest && (
        <TxTile
          label="🔥 최고가 거래"
          value={formatBillion(summary.highest.amountManwon)}
          sub={`${summary.highest.regionLabel} · ${summary.highest.propertyName}`}
          href={`/${summary.highest.slug}/${summary.highest.propertyId}`}
        />
      )}
      {summary.topRegion && (
        <TxTile
          label="🚀 가장 많이 거래된 지역"
          value={summary.topRegion.label}
          sub={`${summary.topRegion.count}건`}
          href={`/list?region=${summary.topRegion.sigunguCode}&sido=${encodeURIComponent(summary.topRegion.sido)}`}
        />
      )}
    </div>
  );
}

function TxTile({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const body = (
    <div className="h-full rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-3">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 break-keep text-base font-black leading-tight tracking-tight ${
          href ? 'text-[var(--color-blue)]' : 'text-[var(--color-blue-dark)]'
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{sub}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
