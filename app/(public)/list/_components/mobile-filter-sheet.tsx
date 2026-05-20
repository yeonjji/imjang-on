'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ListFilterPanel } from './list-filter-panel';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface Props {
  sidoList: SidoItem[];
}

export function MobileFilterSheet({ sidoList }: Props) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  const activeCount = [
    (searchParams.get('type') ?? 'all') !== 'all',
    (searchParams.get('deal') ?? 'all') !== 'all',
    !!searchParams.get('price'),
    !!searchParams.get('area'),
    (searchParams.get('sort') ?? 'recent') !== 'recent',
    !!searchParams.get('region'),
    !!searchParams.get('sido'),
  ].filter(Boolean).length;

  return (
    <div className="flex md:hidden items-center gap-2 mb-4">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="필터">
        <ListFilterPanel sidoList={sidoList} />
      </BottomSheet>
    </div>
  );
}
