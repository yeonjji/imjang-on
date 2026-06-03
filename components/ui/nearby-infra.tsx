'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { InfraCategory } from '@/lib/amenity/infra';

const DISPLAY_CAP = 5;

export function NearbyInfra({ categories }: { categories: InfraCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <Card id="poi">
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주변 생활 인프라</h2>
      <p className="mb-3 text-xs text-[var(--color-muted)]">반경 500m~1km · 가까운 순</p>

      <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto border-b border-[var(--color-line)] px-1 pb-4">
        {categories.map((c) => (
          <span
            key={c.key}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]"
          >
            <span>{c.icon}</span>
            {c.label}
            <span className="text-[var(--color-blue)]">{c.items.length}{c.capped ? '+' : ''} · {c.items[0].distanceMeters}m</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] md:grid-cols-2">
        {categories.map((c) => (
          <InfraBlock key={c.key} category={c} />
        ))}
      </div>
    </Card>
  );
}

function InfraBlock({ category }: { category: InfraCategory }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? category.items : category.items.slice(0, DISPLAY_CAP);
  const hiddenCount = category.items.length - DISPLAY_CAP;

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3.5">
      <div className="mb-1.5 text-sm font-bold text-[var(--color-blue-dark)]">
        <span className="mr-1">{category.icon}</span>
        {category.label}
        <span className="ml-1 text-xs font-semibold text-[var(--color-muted)]">{category.items.length}{category.capped ? '+' : ''}곳</span>
      </div>
      <ul>
        {visible.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2.5 border-b border-[var(--color-line)] py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{it.name}</p>
              {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-blue)]">
              {it.distanceMeters}m
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mt-auto pt-2 text-left text-xs font-bold text-[var(--color-blue)]"
        >
          +{hiddenCount}곳 더보기 →
        </button>
      ) : (
        <p className="mt-auto pt-2 text-xs text-[var(--color-muted)]">
          {category.radiusLabel} {category.items.length}{category.capped ? '+' : ''}곳
        </p>
      )}
    </div>
  );
}
