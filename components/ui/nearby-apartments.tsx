import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { formatBillion } from '@/lib/format';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export function NearbyApartments({ items }: { items: NearbyApartment[] }) {
  if (items.length === 0) return null;
  return (
    <Card id="apt">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">🏠 주변 아파트 실거래가 <span className="text-sm font-normal text-[var(--color-muted)]">· 반경 1km</span></h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((a) => (
          <li key={String(a.id)}>
            <Link href={`/apt/${a.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">
                  {a.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">{a.distanceMeters}m</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{a.region}{a.builtYear ? ` · ${a.builtYear}년` : ''}{a.households ? ` · ${a.households.toLocaleString('ko-KR')}세대` : ''}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-[var(--color-blue-dark)]">{formatBillion(a.saleLastPrice)}</p>
                {a.jeonseLastDeposit != null && <p className="text-xs text-[var(--color-muted)]">전세 {formatBillion(a.jeonseLastDeposit)}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <SourceCaption ids={['molit-rtms']} />
    </Card>
  );
}
