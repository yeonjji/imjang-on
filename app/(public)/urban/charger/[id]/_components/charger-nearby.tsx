import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { NearbyCharger } from '@/lib/urban/nearby';

export function ChargerNearby({ items }: { items: NearbyCharger[] }) {
  if (items.length === 0) return null;
  return (
    <Card id="same">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">⚡ 가까운 전기차충전소</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)}>
            <Link href={`/urban/charger/${it.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">
                  {it.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
                    {it.distanceMeters}m
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                  {it.address} · {it.chargeSpeed} · {it.chargerCount}기
                </p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
