import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { NearbyChildcare as Item } from '@/lib/amenity/nearby';

export function NearbyChildcare({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <Card id="nearby-childcare">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">근처 어린이집 (1km)</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)} className="flex items-center gap-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-sky-soft)] text-base">👶</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                <Link href={`/childcare/${it.sigunguCode}/${it.id}`} className="hover:text-[var(--color-blue)]">{it.name}</Link>
                <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.distanceMeters}m</span>
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {it.crType ?? ''}{it.capacity != null ? ` · 정원 ${it.capacity}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
