import { Card } from '@/components/ui/card';
import { buildPharmacyInfoRows } from '@/lib/pharmacy/utils';
import type { PharmacyRecord } from '@/lib/pharmacy';

interface Props { pharmacy: PharmacyRecord; }

export function PharmacyInfo({ pharmacy }: Props) {
  const rows = buildPharmacyInfoRows(pharmacy);
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">기본 정보</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between gap-4 border-b border-[var(--color-line)] pb-2">
            <dt className="shrink-0 text-sm text-[var(--color-muted)]">{r.label}</dt>
            <dd className="truncate text-sm font-semibold text-[var(--color-blue-dark)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
