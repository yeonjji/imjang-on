import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { NearbyProperty } from '@/lib/nearby';

export function NearbyProperties({
  items,
  slug,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">인근 단지</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{it.region}</p>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{it.distKm.toFixed(2)}km</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
