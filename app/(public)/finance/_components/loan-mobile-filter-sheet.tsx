'use client';

import { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { LoanFilterPanel } from './loan-filter-panel';
import type { LoanFacets, LoanFilterCriteria } from '@/lib/loan/list';

interface Props {
  facets: LoanFacets;
  criteria: LoanFilterCriteria;
  onChange: (next: LoanFilterCriteria) => void;
  activeCount: number;
  resultCount: number;
}

export function LoanMobileFilterSheet({
  facets,
  criteria,
  onChange,
  activeCount,
  resultCount,
}: Props) {
  const [open, setOpen] = useState(false);

  const footer = (
    <Button onClick={() => setOpen(false)} className="w-full">
      결과 {resultCount}개 보기
    </Button>
  );

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
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
      <BottomSheet open={open} onOpenChange={setOpen} title="필터" footer={footer}>
        <LoanFilterPanel facets={facets} criteria={criteria} onChange={onChange} />
      </BottomSheet>
    </div>
  );
}
