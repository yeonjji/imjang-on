'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyStore, NearbyTraditionalMarket } from '@/lib/amenity/nearby';

interface Props {
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  market: NearbyTraditionalMarket[];
}

type Tab = 'convenience' | 'mart' | 'cafe' | 'market';

export function NearbyAmenitiesMixed({ convenience, mart, cafe, market }: Props) {
  const groups: { key: Tab; label: string; icon: string; items: { id: bigint; name: string; sub: string; dist: number }[] }[] = ([
    { key: 'convenience' as const, label: '편의점', icon: '🏪', items: convenience.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '편의점', dist: s.distanceMeters })) },
    { key: 'mart' as const, label: '마트', icon: '🛒', items: mart.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '마트', dist: s.distanceMeters })) },
    { key: 'cafe' as const, label: '카페', icon: '☕', items: cafe.map((s) => ({ id: s.id, name: s.name, sub: s.industryName ?? '카페', dist: s.distanceMeters })) },
    { key: 'market' as const, label: '전통시장', icon: '🏬', items: market.map((m) => ({ id: m.id, name: m.name, sub: m.marketType ?? '전통시장', dist: m.distanceMeters })) },
  ]).filter((g) => g.items.length > 0);

  const [tab, setTab] = useState<Tab | null>(groups[0]?.key ?? null);
  if (!tab) return null;
  const active = groups.find((g) => g.key === tab)!;
  return (
    <Card id="poi">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 상권 종합</h2>
      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1">
        {groups.map((g) => (
          <button key={g.key} onClick={() => setTab(g.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === g.key ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] bg-white text-[var(--color-muted)]'}`}>
            {g.label}
          </button>
        ))}
      </div>
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
    </Card>
  );
}
