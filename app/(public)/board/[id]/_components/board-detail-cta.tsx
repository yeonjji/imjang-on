import Link from 'next/link';
import { formatBillion } from '@/lib/format';
import { deriveStatus, ddayLabel, STATUS_LABEL, STATUS_TONE } from '@/lib/subscription';
import { SourceCaption } from '@/components/ui/source-caption';
import { Badge } from '@/components/ui/badge';
import {
  getTransactionTeaser,
  getSubscriptionTeaser,
  type SubscriptionTeaser,
} from '@/lib/board/detail-teasers';
import type { MarketBriefing } from '@/lib/briefing';

const cardClass =
  'flex flex-col rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]';

/** refDate(YYYY-MM-DD) → "6월 21일[ 최근] 수집 기준" (isFallback 시 '오늘' 단정 회피). */
function refDateLabel(b: MarketBriefing): string {
  const [, mm, dd] = b.refDate.split('-');
  return `${Number(mm)}월 ${Number(dd)}일${b.isFallback ? ' 최근' : ''} 수집 기준`;
}

function TransactionCard({ briefing }: { briefing: MarketBriefing }) {
  const { summary } = briefing;
  return (
    <div className={cardClass}>
      <p className="text-[15px] font-black tracking-tight text-[var(--color-blue-dark)]">📊 오늘의 실거래가</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{refDateLabel(briefing)}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-muted)]">신고 건수</dt>
          <dd className="font-bold">{summary.txCount.toLocaleString('ko-KR')}건</dd>
        </div>
        {summary.highest && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-[var(--color-muted)]">최고가</dt>
            <dd className="truncate font-bold">
              {formatBillion(summary.highest.amountManwon)} · {summary.highest.regionLabel}
            </dd>
          </div>
        )}
        {summary.topRegion && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-[var(--color-muted)]">최다 거래 지역</dt>
            <dd className="truncate font-bold">
              {summary.topRegion.label} ({summary.topRegion.count}건)
            </dd>
          </div>
        )}
      </dl>
      <Link href="/list" className="mt-3 text-[13px] font-bold text-[var(--color-blue)] hover:underline">
        실거래가 보기 →
      </Link>
      <SourceCaption ids={['molit-rtms']} />
    </div>
  );
}

function SubscriptionCard({ teaser }: { teaser: SubscriptionTeaser }) {
  const { item, status } = teaser;
  const dday = ddayLabel(deriveStatus(item.receiptBegin, item.receiptEnd));
  return (
    <div className={cardClass}>
      <p className="text-[15px] font-black tracking-tight text-[var(--color-blue-dark)]">🏠 가장 가까운 청약</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {dday && <span className="text-xs font-bold text-[var(--color-muted)]">{dday}</span>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-bold text-[var(--color-text)]">{item.name}</p>
      {item.regionName && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{item.regionName}</p>}
      <Link href="/subscription" className="mt-3 text-[13px] font-bold text-[var(--color-blue)] hover:underline">
        청약 일정 보기 →
      </Link>
      <SourceCaption ids={['applyhome']} />
    </div>
  );
}

/** 게시글 상세 하단: 오늘의 실거래가 + 가장 가까운 청약 + 금융정보 바로가기. */
export async function BoardDetailCta() {
  const [briefing, subscription] = await Promise.all([getTransactionTeaser(), getSubscriptionTeaser()]);

  return (
    <section className="mt-12">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {briefing && <TransactionCard briefing={briefing} />}
        {subscription && <SubscriptionCard teaser={subscription} />}
      </div>
      <Link
        href="/finance"
        className="mt-4 flex items-center justify-between rounded-[20px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4 transition hover:border-[var(--color-blue)]"
      >
        <span className="text-sm font-bold text-[var(--color-blue-dark)]">💳 금융정보도 둘러보세요</span>
        <span className="text-[13px] font-bold text-[var(--color-blue)]">바로가기 →</span>
      </Link>
    </section>
  );
}
