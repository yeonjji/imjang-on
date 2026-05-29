import { Card } from '@/components/ui/card';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';

export function UrbanInfo({ item, def, regionFullName }: { item: UrbanItem; def: UrbanCategoryDef; regionFullName: string }) {
  const fields = def.detailFields(item, { regionFullName });
  const rows = [...fields, { label: '지역', value: regionFullName || '-' }];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.label} 기본정보</h2>
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
