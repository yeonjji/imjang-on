import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import type {
  NearbyApartment,
  NearbyHospital,
  NearbyPark,
  NearbyStore,
  NearbyTraditionalMarket,
  NearbyEvCharger,
  NearbyChildcare,
} from '@/lib/amenity/nearby';

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
  hospitals: NearbyHospital[];
  parks: NearbyPark[];
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  markets: NearbyTraditionalMarket[];
  chargers: NearbyEvCharger[];
  childcare: NearbyChildcare[];
}

export function PharmacyNearby({
  apts, hospitals, parks, convenience, mart, cafe, markets, chargers, childcare,
}: Props) {
  const sections: { show: boolean; node: ReactNode }[] = [
    {
      show: apts.length > 0,
      node: <NearbyCard title="주변 아파트" icon="🏢"
        items={apts.slice(0, 5).map(a => ({ id: a.id, name: a.name, sub: a.region, distanceMeters: a.distanceMeters }))} />,
    },
    {
      show: hospitals.length > 0,
      node: <NearbyCard title="주변 병원·의원" icon="🏥"
        items={hospitals.slice(0, 5).map(h => ({ id: h.id, name: h.name, sub: h.typeName, distanceMeters: h.distanceMeters }))} />,
    },
    {
      show: parks.length > 0,
      node: <NearbyCard title="주변 공원" icon="🌳"
        items={parks.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.parkType ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: convenience.length > 0,
      node: <NearbyCard title="편의점" icon="🏪"
        items={convenience.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: mart.length > 0,
      node: <NearbyCard title="마트" icon="🛒"
        items={mart.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: cafe.length > 0,
      node: <NearbyCard title="카페" icon="☕"
        items={cafe.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: markets.length > 0,
      node: <NearbyCard title="전통시장" icon="🏬"
        items={markets.slice(0, 5).map(m => ({ id: m.id, name: m.name, sub: m.marketType ?? undefined, distanceMeters: m.distanceMeters }))} />,
    },
    {
      show: chargers.length > 0,
      node: <NearbyCard title="전기차 충전소" icon="⚡"
        items={chargers.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters }))} />,
    },
    {
      show: childcare.length > 0,
      node: <NearbyCard title="어린이집" icon="👶"
        items={childcare.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: c.crType ?? undefined, distanceMeters: c.distanceMeters }))} />,
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
