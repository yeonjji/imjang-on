import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { WeeklyBoardItem } from '@/lib/subscription';

export function SubscriptionBoardItem({ item }: { item: WeeklyBoardItem }) {
  return (
    <Link
      href={`/subscription/${item.id}`}
      className="group flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-2.5 py-2 transition hover:border-[var(--color-blue)]"
    >
      <Badge tone={item.tone} className="shrink-0">{item.badge}</Badge>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-blue-dark)]">
        {item.name}
      </span>
      {item.regionShort && (
        <span className="shrink-0 text-xs font-medium text-[var(--color-muted)]">
          {item.regionShort}
        </span>
      )}
      <span className="shrink-0 text-[var(--color-muted)] transition group-hover:translate-x-0.5">›</span>
    </Link>
  );
}
