'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatNearbyPrice, formatNearbyParts, type NearbyProperty, type NearbyTab } from '@/lib/nearby';
import type { AgeBaseline } from '@/lib/apt-region/compare';

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
  baseline,
}: {
  items: NearbyProperty[];
  slug: 'apt' | 'officetel' | 'villa';
  id?: string;
  /** 아파트만: 시군구 같은 면적대·같은 연식대 ㎡당 중간값 대비 이 단지 평형(lib/apt-region). */
  baseline?: AgeBaseline | null;
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
      {baseline && (
        <div className="mb-4 rounded-2xl border border-[var(--color-line)] p-4">
          <p className="break-keep text-sm font-bold text-[var(--color-blue-dark)]">
            같은 면적대 · 비슷한 연식({baseline.ageLabel}) {baseline.label} 아파트와 비교
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {baseline.rows.map((r) => (
              <li key={r.pyeong} className="rounded-xl bg-[var(--color-soft)] px-3 py-2 text-sm">
                <b className="text-[var(--color-blue-dark)]">{r.pyeong}평</b>{' '}
                <span className="font-bold text-[var(--color-blue-dark)]">
                  {r.diffPct >= 0.5 ? '+' : r.diffPct <= -0.5 ? '−' : ''}
                  {Math.abs(Math.round(r.diffPct))}%
                </span>
                <span className="block text-xs text-[var(--color-muted)]">
                  ㎡당 {Math.round(r.ppa).toLocaleString('ko-KR')}만원 · 지역 {Math.round(r.regionMedian).toLocaleString('ko-KR')}만원 ({r.regionCount.toLocaleString('ko-KR')}건)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link prefetch={false} href={`/${slug}/${it.id}`} className="flex items-center justify-between gap-3 py-3">
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
