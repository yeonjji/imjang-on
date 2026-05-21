'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pendingParams, setPendingParams] = useState<URLSearchParams>(new URLSearchParams());

  const activeCount = [
    (searchParams.get('type') ?? 'all') !== 'all',
    (searchParams.get('deal') ?? 'all') !== 'all',
    !!(searchParams.get('price_min') || searchParams.get('price_max')),
    !!searchParams.get('area'),
    (searchParams.get('sort') ?? 'recent') !== 'recent',
    !!(searchParams.get('region') || searchParams.get('sido')),
  ].filter(Boolean).length;

  function handleApply() {
    const qs = pendingParams.toString();
    router.push(qs ? `/list?${qs}` : '/list');
    setOpen(false);
  }

  function handleReset() {
    setPendingParams(new URLSearchParams());
  }

  const footer = (
    <div className="flex gap-3">
      <Button variant="ghost" size="sm" onClick={handleReset} className="shrink-0">
        필터 초기화
      </Button>
      <Button onClick={handleApply} className="flex-1">
        조회
      </Button>
    </div>
  );

  return (
    <div className="flex md:hidden items-center gap-2 mb-4">
      <button
        onClick={() => {
          setPendingParams(new URLSearchParams(searchParams.toString()));
          setOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="필터" footer={footer}>
        <ListFilterPanel
          sidoList={sidoList}
          params={pendingParams}
          onParamsChange={setPendingParams}
        />
      </BottomSheet>
    </div>
  );
}
