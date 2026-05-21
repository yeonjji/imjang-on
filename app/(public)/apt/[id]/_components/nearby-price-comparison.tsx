import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { NearbyProperty } from '@/lib/nearby';

export function NearbyPriceComparison({
  items,
  slug,
  id,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
  id?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">
        주변 단지 실거래가 비교
      </h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {it.region} · {it.distKm.toFixed(2)}km
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--color-blue-dark)]">
                  {it.saleLastPrice != null ? formatBillion(it.saleLastPrice) : '-'}
                </p>
                {it.jeonseLastDeposit != null && (
                  <p className="text-xs text-[var(--color-muted)]">
                    전세 {formatBillion(it.jeonseLastDeposit)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
