'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { HospitalFilterPanel } from './hospital-filter-panel';

interface Region { sido: string; sigungu: string; sigunguCode: string; }
interface TypeCode { typeCode: string; typeName: string; }

interface Props {
  regions: Region[];
  typeCodes: TypeCode[];
}

export function HospitalMobileFilterSheet({ regions, typeCodes }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));
  // 시트를 열거나 초기화할 때 패널을 리마운트해 selectedSido 초기값을 다시 계산
  const [seq, setSeq] = useState(0);

  const activeCount = ['region', 'type'].filter(k => {
    const v = sp.get(k);
    return v && v !== '';
  }).length;

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => { setPending(new URLSearchParams(sp.toString())); setSeq(s => s + 1); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="필터"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setPending(new URLSearchParams()); setSeq(s => s + 1); }} className="shrink-0">
              초기화
            </Button>
            <Button
              onClick={() => {
                const qs = pending.toString();
                router.push(qs ? `/medical/hospital?${qs}` : '/medical/hospital');
                setOpen(false);
              }}
              className="flex-1"
            >
              조회
            </Button>
          </div>
        }
      >
        <HospitalFilterPanel
          key={seq}
          regions={regions}
          typeCodes={typeCodes}
          params={pending}
          onParamsChange={setPending}
        />
      </BottomSheet>
    </div>
  );
}
