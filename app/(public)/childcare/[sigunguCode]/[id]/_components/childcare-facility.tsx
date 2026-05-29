import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';

export function ChildcareFacility({ item }: { item: Childcare }) {
  const items: { label: string; value: string }[] = [
    { label: '보육실', value: item.roomCount != null ? `${item.roomCount}실${item.roomSize != null ? ` · ${item.roomSize}㎡` : ''}` : '-' },
    { label: '놀이터', value: item.playgroundCount != null ? `${item.playgroundCount}개` : '-' },
    { label: 'CCTV', value: item.cctvCount != null ? `${item.cctvCount}대` : '-' },
    { label: '교직원', value: item.staffCount != null ? `${item.staffCount}명` : '-' },
  ];
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
