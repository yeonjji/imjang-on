import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyApartment, NearbyPharmacy, NearbyPark, NearbyStore, NearbyEvCharger } from '@/lib/amenity/nearby';

type SimpleItem = { id: bigint; name: string; sub?: string; distanceMeters: number };

function NearbyCard({ title, icon, items }: { title: string; icon: string; items: SimpleItem[] }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">{icon} {title}</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map(it => (
          <li key={String(it.id)} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {it.name}
                <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
                  {Math.round(Number(it.distanceMeters))}m
                </span>
              </p>
              {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface Props {
  apts: NearbyApartment[];
  pharmacies: NearbyPharmacy[];
  parks: NearbyPark[];
  stores: NearbyStore[];
  chargers: NearbyEvCharger[];
}

export function HospitalNearby({ apts, pharmacies, parks, stores, chargers }: Props) {
  const sections: { show: boolean; node: ReactNode }[] = [
    {
      show: apts.length > 0,
      node: <NearbyCard title="주변 아파트" icon="🏢"
        items={apts.slice(0, 5).map(a => ({ id: a.id, name: a.name, sub: a.region, distanceMeters: a.distanceMeters }))} />,
    },
    {
      show: pharmacies.length > 0,
      node: <NearbyCard title="주변 약국" icon="💊"
        items={pharmacies.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.tel ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: parks.length > 0,
      node: <NearbyCard title="주변 공원" icon="🌳"
        items={parks.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.parkType ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: stores.length > 0,
      node: <NearbyCard title="편의점·마트" icon="🛒"
        items={stores.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: chargers.length > 0,
      node: <NearbyCard title="전기차 충전소" icon="⚡"
        items={chargers.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters }))} />,
    },
  ];

  const visible = sections.filter(s => s.show);
  if (visible.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 인프라</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {visible.map((s, i) => <div key={i}>{s.node}</div>)}
      </div>
    </div>
  );
}
