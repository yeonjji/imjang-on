'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { AmenityFilterPanel } from './amenity-filter-panel';
import type { AmenityCategoryView } from '@/lib/amenity/category';

interface SidoItem { code: string; sido: string; fullName: string; }

export function AmenityMobileFilterSheet({ def, basePath, sidoList }: { def: AmenityCategoryView; basePath: string; sidoList?: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeKeys = ['sido', 'q', ...(def.subFilters ? [def.subFilters.paramKey] : [])];
  const activeCount = activeKeys.filter((k) => {
    const v = sp.get(k);
    return v && v !== 'all';
  }).length;

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => { setPending(new URLSearchParams(sp.toString())); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터{activeCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">{activeCount}</span>}
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="필터"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPending(new URLSearchParams())} className="shrink-0">초기화</Button>
            <Button onClick={() => { const qs = pending.toString(); router.push(qs ? `${basePath}?${qs}` : basePath); setOpen(false); }} className="flex-1">조회</Button>
          </div>
        }
      >
        <AmenityFilterPanel def={def} basePath={basePath} sidoList={sidoList} params={pending} onParamsChange={setPending} />
      </BottomSheet>
    </div>
  );
}
