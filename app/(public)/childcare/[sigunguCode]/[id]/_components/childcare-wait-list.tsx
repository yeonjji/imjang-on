import { DetailsCard } from '@/components/ui/details-card';
import type { Childcare } from '@prisma/client';

const AGES = [
  ['00', '만 0세'], ['01', '만 1세'], ['02', '만 2세'],
  ['03', '만 3세'], ['04', '만 4세'], ['05', '만 5세'], ['M6', '6세 이상'],
] as const;

export function ChildcareWaitList({ item }: { item: Childcare }) {
  if (item.waitCntTot == null || item.waitCntTot === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = item as any;
  return (
    <DetailsCard id="wait-list" title="입소대기 현황" summary={`총 ${item.waitCntTot}명 대기`}>
      <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {AGES.map(([k, label]) => {
          const v = i[`waitCnt${k}`] ?? 0;
          if (v === 0) return null;
          return (
            <li key={k} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
              <span className="text-[var(--color-muted)]">{label}</span>
              <span className="font-mono font-bold text-[var(--color-blue-dark)]">{v}명</span>
            </li>
          );
        })}
      </ul>
    </DetailsCard>
  );
}
