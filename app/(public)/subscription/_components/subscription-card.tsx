import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import {
  categoryLabel,
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  formatPriceRange,
  formatAreaRange,
  type SubscriptionListItem,
} from '@/lib/subscription';

export function SubscriptionCard({ item }: { item: SubscriptionListItem }) {
  const st = deriveStatus(item.receiptBegin, item.receiptEnd);
  const dday = ddayLabel(st);
  const period =
    item.receiptBegin || item.receiptEnd
      ? `${formatDate(item.receiptBegin)} ~ ${formatDate(item.receiptEnd)}`
      : '일정 미정';

  return (
    <Link href={`/subscription/${item.id}`}>
      <article className="rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)] transition hover:shadow-lg">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="blue">{categoryLabel(item.category)}</Badge>
          <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
            {STATUS_LABEL[st.status]}
            {dday ? ` · ${dday}` : ''}
          </Badge>
        </div>

        <h3 className="mb-1 break-keep text-xl font-bold text-[var(--color-blue-dark)]">
          {item.name}
        </h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          {item.regionName ?? '지역 미정'}
          {item.unitCount > 0 ? ` · 주택형 ${item.unitCount}개` : ''}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">접수기간</span>
            <strong className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">
              {period}
            </strong>
          </div>
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">분양가</span>
            <strong className="block whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
              {formatPriceRange(item.minPrice, item.maxPrice)}
            </strong>
          </div>
          <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">
              {item.totalSupply != null ? '총 공급' : '전용면적'}
            </span>
            <strong className="block whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
              {item.totalSupply != null
                ? `${item.totalSupply.toLocaleString('ko-KR')}세대`
                : formatAreaRange(item.minArea, item.maxArea)}
            </strong>
          </div>
        </div>
      </article>
    </Link>
  );
}
