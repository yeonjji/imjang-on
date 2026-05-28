import { Card } from '@/components/ui/card';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityInfo({ item, def, regionFullName }: { item: AmenityItem; def: AmenityCategoryDef; regionFullName: string }) {
  const rows = [...def.detailFields(item), { label: '지역', value: regionFullName }];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.label} 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{r.label}</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">{r.value || '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
