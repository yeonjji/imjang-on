'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatNearbyPrice, formatNearbyParts, type NearbyProperty, type NearbyTab } from '@/lib/nearby';

const TABS: { key: NearbyTab; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

export function NearbyPriceComparison({
  items,
  slug,
  id,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
  id?: string;
}) {
  const [tab, setTab] = useState<NearbyTab>('ALL');

  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주변 단지 실거래가 비교</h2>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-blue-dark)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {it.region} · {it.distKm.toFixed(2)}km
                </p>
              </div>
              {tab === 'ALL' ? (
                <div className="shrink-0 text-right text-sm font-bold text-[var(--color-blue-dark)]">
                  {/* 데스크톱: 한 줄 */}
                  <span className="hidden whitespace-nowrap sm:inline">
                    {formatNearbyPrice(it, 'ALL')}
                  </span>
                  {/* 모바일: 세로 분리 */}
                  <span className="flex flex-col items-end gap-0.5 sm:hidden">
                    {formatNearbyParts(it).map((p) => (
                      <span key={p.label} className="whitespace-nowrap">
                        <span className="text-xs font-medium text-[var(--color-muted)]">
                          {p.label}{' '}
                        </span>
                        {p.value}
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <p className="shrink-0 whitespace-nowrap text-right text-sm font-bold text-[var(--color-blue-dark)]">
                  {formatNearbyPrice(it, tab)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
