import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';
import { childcareInfoRows } from '@/lib/childcare';

export function ChildcareInfo({ item, regionFullName }: { item: Childcare; regionFullName: string }) {
  const rows = childcareInfoRows(item, regionFullName);
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">기본 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{k}</span>
            <span className="ml-2 truncate text-sm font-semibold text-[var(--color-text)]" title={v ?? '-'}>{v ?? '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
