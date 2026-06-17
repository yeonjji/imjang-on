'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { SourceCaption } from '@/components/ui/source-caption';
import type { InfraCategory, InfraCategoryKey, InfraItem } from '@/lib/amenity/infra';
import type { DataSourceId } from '@/lib/data-sources';

const DISPLAY_CAP = 5;

const INFRA_SOURCE: Record<InfraCategoryKey, DataSourceId> = {
  store: 'semas-store',
  cafe: 'semas-store',
  etc: 'semas-store',
  hospital: 'hira',
  pharmacy: 'hira',
  park: 'mois-park',
  market: 'mois-market',
  charger: 'kepco-ev',
  parking: 'mois-parking',
  childcare: 'childcare',
};

export function NearbyInfra({ categories }: { categories: InfraCategory[] }) {
  const [modalCat, setModalCat] = useState<InfraCategory | null>(null);
  if (categories.length === 0) return null;
  const sourceIds = Array.from(new Set(categories.map((c) => INFRA_SOURCE[c.key])));
  return (
    <>
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

        <div className="grid grid-cols-1 gap-3 items-start md:grid-cols-2 md:[grid-auto-rows:1fr] md:items-stretch">
          {categories.map((c) => (
            <InfraBlock key={c.key} category={c} onOpenModal={setModalCat} />
          ))}
        </div>

        <SourceCaption ids={sourceIds} />
      </Card>

      <Modal
        open={modalCat !== null}
        onOpenChange={(o) => { if (!o) setModalCat(null); }}
        title={modalCat ? `${modalCat.icon} ${modalCat.label} ${modalCat.items.length}${modalCat.capped ? '+' : ''}곳` : ''}
      >
        <ul className="max-h-[60vh] overflow-y-auto">
          {modalCat?.items.map((it) => <InfraRow key={it.id} item={it} />)}
        </ul>
      </Modal>
    </>
  );
}

function InfraRow({ item: it }: { item: InfraItem }) {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{it.name}</p>
        {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-blue)]">
          {it.distanceMeters}m
        </span>
        {it.href && <span aria-hidden className="text-[var(--color-muted)]">›</span>}
      </div>
    </>
  );
  return (
    <li className="border-b border-[var(--color-line)] last:border-0">
      {it.href ? (
        <Link
          href={it.href}
          className="-mx-1.5 flex items-center justify-between gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-[var(--color-sky-soft)]"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-2.5 py-2">{inner}</div>
      )}
    </li>
  );
}

function InfraBlock({
  category,
  onOpenModal,
}: {
  category: InfraCategory;
  onOpenModal: (c: InfraCategory) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? category.items : category.items.slice(0, DISPLAY_CAP);
  const hiddenCount = category.items.length - DISPLAY_CAP;

  // 데스크탑(≥md)은 모달로 전체 목록, 모바일은 기존 인라인 확장.
  const handleMore = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      onOpenModal(category);
    } else {
      setExpanded(true);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3.5">
      <div className="mb-1.5 text-sm font-bold text-[var(--color-blue-dark)]">
        <span className="mr-1">{category.icon}</span>
        {category.label}
        <span className="ml-1 text-xs font-semibold text-[var(--color-muted)]">{category.items.length}{category.capped ? '+' : ''}곳</span>
      </div>
      <ul>
        {visible.map((it) => (
          <InfraRow key={it.id} item={it} />
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <button
          onClick={handleMore}
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
