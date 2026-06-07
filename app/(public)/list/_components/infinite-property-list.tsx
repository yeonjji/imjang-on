'use client';

import { useEffect, useRef, useState } from 'react';
import { withAdSlots } from '@/lib/property';
import type { PropertyListItem, DealFilter } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
import { AdSlot } from './ad-slot';

const AUTO_MAX = 3;
const AD_INTERVAL = 8;

interface Props {
  initialItems: PropertyListItem[];
  totalPages: number;
  deal: DealFilter;
  query: string;
}

export function InfinitePropertyList({ initialItems, totalPages, deal, query }: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const done = page >= totalPages;
  const canAuto = !done && page - 1 < AUTO_MAX;

  async function loadMore() {
    if (loading || done) return;
    setLoading(true);
    setError(false);
    const next = page + 1;
    try {
      const res = await fetch(`/api/list?${query}&page=${next}`);
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { items: PropertyListItem[] };
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAuto) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuto, page]);

  const feed = withAdSlots(items, AD_INTERVAL);

  return (
    <>
      <div className="flex flex-col gap-3">
        {feed.map((entry) =>
          entry.type === 'ad' ? (
            <AdSlot key={entry.key} />
          ) : (
            <PropertyListCard key={entry.item.id} property={entry.item} deal={deal} />
          ),
        )}
      </div>

      {!done && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {canAuto && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
          {loading && <p className="text-sm text-[var(--color-muted)]">불러오는 중…</p>}
          {error && (
            <button
              onClick={loadMore}
              className="h-11 rounded-xl border border-[var(--color-line)] px-5 text-sm font-bold text-[var(--color-blue)]"
            >
              다시 시도
            </button>
          )}
          {!canAuto && !loading && !error && (
            <button
              onClick={loadMore}
              className="h-12 w-full max-w-sm rounded-2xl border border-[var(--color-blue)] bg-[var(--color-soft)] text-sm font-bold text-[var(--color-blue)] hover:bg-white"
            >
              30개 더보기 ↓
            </button>
          )}
        </div>
      )}

      {done && (
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          모든 결과를 불러왔습니다
        </p>
      )}
    </>
  );
}
