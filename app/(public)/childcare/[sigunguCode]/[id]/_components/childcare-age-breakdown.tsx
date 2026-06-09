import { DetailsCard } from '@/components/ui/details-card';
import { childcareCount } from '@/lib/childcare';
import type { Childcare } from '@prisma/client';

const AGES = [
  ['00', '만 0세'], ['01', '만 1세'], ['02', '만 2세'],
  ['03', '만 3세'], ['04', '만 4세'], ['05', '만 5세'],
] as const;
const MIXED = [
  ['M2', '영아혼합(0~2세)'], ['M3', '영유아혼합(2~3세)'], ['M5', '유아혼합(3~5세)'], ['Sp', '특수장애'],
] as const;

function row(item: Childcare, key: string): { cls: number | null; chd: number | null } {
  return { cls: childcareCount(item, `classCnt${key}`), chd: childcareCount(item, `childCnt${key}`) };
}

export function ChildcareAgeBreakdown({ item }: { item: Childcare }) {
  if (item.classCntTot == null && item.childCntTot == null) {
    return (
      <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-muted)] shadow-[var(--shadow-soft)] md:p-7">
        <h2 className="mb-2 text-lg font-bold text-[var(--color-blue-dark)]">연령별 현황</h2>
        공시 데이터 없음
      </div>
    );
  }
  const summary = `반 ${item.classCntTot ?? '-'} · 아동 ${item.childCntTot ?? '-'}명`;
  return (
    <DetailsCard id="age-breakdown" title="연령별 현황" summary={summary} defaultOpenMobile>
      <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-soft)] text-xs">
            <tr>
              <th className="px-3 py-2 text-left text-[var(--color-muted)]">연령</th>
              <th className="px-3 py-2 text-right text-[var(--color-muted)]">반</th>
              <th className="px-3 py-2 text-right text-[var(--color-muted)]">아동</th>
            </tr>
          </thead>
          <tbody>
            {AGES.map(([k, label]) => {
              const r = row(item, k);
              return (
                <tr key={k} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cls ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.chd ?? '-'}</td>
                </tr>
              );
            })}
            {MIXED.map(([k, label]) => {
              const r = row(item, k);
              if (r.cls == null && r.chd == null) return null;
              return (
                <tr key={k} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 text-[var(--color-muted)]">{label}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cls ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.chd ?? '-'}</td>
                </tr>
              );
            })}
            <tr className="border-t border-[var(--color-line)] bg-[var(--color-soft)]">
              <td className="px-3 py-2 font-bold">합계</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{item.classCntTot ?? '-'}</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{item.childCntTot ?? '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DetailsCard>
  );
}
