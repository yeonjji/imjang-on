import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { WeeklyBoardItem } from '@/lib/subscription';

export function SubscriptionBoardItem({ item }: { item: WeeklyBoardItem }) {
  return (
    <Link
      href={`/subscription/${item.id}`}
      className="block rounded-xl border border-[var(--color-line)] bg-white px-2.5 py-2 transition hover:border-[var(--color-blue)]"
    >
      <Badge tone={item.tone} className="mb-1">{item.badge}</Badge>
      <p className="truncate text-sm font-bold text-[var(--color-blue-dark)]">{item.name}</p>
      {item.regionShort && (
        <p className="truncate text-xs font-medium text-[var(--color-muted)]">{item.regionShort}</p>
      )}
    </Link>
  );
}
