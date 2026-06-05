'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { SubscriptionFilterPanel } from './subscription-filter-panel';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

export function SubscriptionMobileFilterSheet({ sidoList }: { sidoList: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pendingParams, setPendingParams] = useState(
    () => new URLSearchParams(searchParams.toString()),
  );

  const activeCount = [
    !!searchParams.get('category'),
    !!searchParams.get('sido'),
    (searchParams.get('status') ?? 'all') !== 'all',
    (searchParams.get('sort') ?? 'recent') !== 'recent',
  ].filter(Boolean).length;

  function handleApply() {
    const qs = pendingParams.toString();
    router.push(qs ? `/subscription?${qs}` : '/subscription');
    setOpen(false);
  }

  const footer = (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPendingParams(new URLSearchParams())}
        className="shrink-0"
      >
        필터 초기화
      </Button>
      <Button onClick={handleApply} className="flex-1">
        조회
      </Button>
    </div>
  );

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
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
        <SubscriptionFilterPanel
          sidoList={sidoList}
          params={pendingParams}
          onParamsChange={setPendingParams}
        />
      </BottomSheet>
    </div>
  );
}
