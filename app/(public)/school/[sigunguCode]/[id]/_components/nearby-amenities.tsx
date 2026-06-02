'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyPark, NearbyStore, NearbyEvCharger } from '@/lib/amenity/nearby';

interface Props { parks: NearbyPark[]; mart: NearbyStore[]; chargers: NearbyEvCharger[]; }
type Tab = 'park' | 'mart' | 'charger';

export function NearbyAmenities({ parks, mart, chargers }: Props) {
  const [tab, setTab] = useState<Tab>('park');
  const tabs: { key: Tab; label: string; icon: string; items: { id: bigint; name: string; sub: string; dist: number }[] }[] = [
    { key: 'park', label: '공원', icon: '🌳', items: parks.map((p) => ({ id: p.id, name: p.name, sub: p.parkType ?? '공원', dist: p.distanceMeters })) },
    { key: 'mart', label: '마트·편의', icon: '🛒', items: mart.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '', dist: s.distanceMeters })) },
    { key: 'charger', label: '충전소', icon: '⚡', items: chargers.map((c) => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, dist: c.distanceMeters })) },
  ];
  const active = tabs.find((t) => t.key === tab)!;
  return (
    <Card id="poi">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 생활 인프라</h2>
      <div className="mb-3 flex gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] bg-white text-[var(--color-muted)]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {active.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted)]">반경 내 {active.label} 정보가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {active.items.map((it) => (
            <li key={String(it.id)} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-soft)] text-base">{active.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{it.name}<span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.dist}m</span></p>
                {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
