import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  formatPriceRange,
  formatAreaRange,
  type SubscriptionListItem,
} from '@/lib/subscription';
import { formatReceiptPeriodShort } from '@/lib/format';

interface NearbySubscriptionsProps {
  id?: string;
  items: SubscriptionListItem[];
  scopeLabel: string;
  sido: string;
}

export function NearbySubscriptions({ id, items, scopeLabel, sido }: NearbySubscriptionsProps) {
  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">이 지역 청약</h2>
        <Badge tone="blue">{scopeLabel}</Badge>
      </div>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((item) => {
          const st = deriveStatus(item.receiptBegin, item.receiptEnd);
          const dday = ddayLabel(st);
          return (
            <li key={item.id}>
              <Link
                href={`/subscription/${item.id}`}
                className="flex flex-col gap-1 py-3 transition hover:opacity-80"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
                    {STATUS_LABEL[st.status]}
                    {dday ? ` · ${dday}` : ''}
                  </Badge>
                  <span className="min-w-0 truncate font-bold text-[var(--color-blue-dark)]">
                    {item.name}
                  </span>
                </div>
                <span className="text-sm text-[var(--color-muted)]">
                  {formatAreaRange(item.minArea, item.maxArea)} ·{' '}
                  {formatPriceRange(item.minPrice, item.maxPrice)} ·{' '}
                  {formatReceiptPeriodShort(item.receiptBegin, item.receiptEnd)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/subscription?sido=${encodeURIComponent(sido)}`}
        className="mt-4 block text-right text-sm font-semibold text-[var(--color-blue-dark)] hover:underline"
      >
        {sido} 청약 더보기 →
      </Link>
    </Card>
  );
}
