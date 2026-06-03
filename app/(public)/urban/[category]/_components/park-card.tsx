import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { UrbanItem } from '@/lib/urban/category';
import { PARK_TYPE_EMOJI, formatParkArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkCard({ item }: { item: UrbanItem<ParkRaw> }) {
  const r = item.raw;
  const emoji = (r.parkType && PARK_TYPE_EMOJI[r.parkType]) ?? '🌳';
  const area = formatParkArea(r.area);

  return (
    <Link href={`/urban/park/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.parkType && <Badge tone="green">{r.parkType}</Badge>}
            {area && <Badge tone="gray">{area}</Badge>}
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{item.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
