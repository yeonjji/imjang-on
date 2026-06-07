'use client';

import { useEffect, useRef, useState } from 'react';
import { withAdSlots } from '@/lib/property';
import type { PropertyListItem, DealFilter } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
// 광고: 코드 유지, 화면 비표시. AdSense 연동 후 아래 import + 렌더를 활성화한다.
// import { AdSlot } from './ad-slot';

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
  const inFlightRef = useRef(false);
  // 수동 "더보기" 클릭 이후 다시 AUTO_MAX번 자동 로드되도록 기준 페이지를 추적(하이브리드 반복)
  const [autoAnchor, setAutoAnchor] = useState(1);

  const done = page >= totalPages;
  const canAuto = !done && page - autoAnchor < AUTO_MAX;

  async function loadMore(manual = false) {
    if (inFlightRef.current || done) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(false);
    const next = page + 1;
    try {
      const res = await fetch(`/api/list?${query}&page=${next}`);
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { items: PropertyListItem[] };
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
      // 수동 클릭이면 이 페이지부터 다시 자동 로드 허용
      if (manual) setAutoAnchor(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
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
            // 광고 영역: 코드 유지, 화면 비표시. 연동 후 <AdSlot key={entry.key} />로 활성화.
            null
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
              onClick={() => loadMore()}
              className="h-11 rounded-xl border border-[var(--color-line)] px-5 text-sm font-bold text-[var(--color-blue)]"
            >
              다시 시도
            </button>
          )}
          {!canAuto && !loading && !error && (
            <button
              onClick={() => loadMore(true)}
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
