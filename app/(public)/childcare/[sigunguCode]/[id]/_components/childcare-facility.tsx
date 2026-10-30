import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';
import { childcareFacilityRows } from '@/lib/childcare';

export function ChildcareFacility({ item }: { item: Childcare }) {
  const items = childcareFacilityRows(item);
  return (
    <Card id="facility">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">시설</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3 text-center">
            <div className="text-xs text-[var(--color-muted)]">{it.label}</div>
            <div className="mt-1 text-base font-bold text-[var(--color-blue-dark)]">{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
