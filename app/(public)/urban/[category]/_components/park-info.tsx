import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import { formatArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkInfo({ item }: { item: UrbanItem<ParkRaw> }) {
  const r = item.raw;
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 기본정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">공원 유형</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.parkType ?? '-'}</span>
        </div>
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">면적</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{formatArea(r.area) ?? '-'}</span>
        </div>
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5 sm:col-span-2">
          <span className="text-sm text-[var(--color-muted)]">주소</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.address}</span>
        </div>
      </div>
    </Card>
  );
}
