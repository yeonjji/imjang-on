import { Badge } from '@/components/ui/badge';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityHero({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">{def.emoji}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{item.name}</h1>
          <Badge tone="blue">{def.label}</Badge>
          {summary && summary !== def.label && <Badge tone="gray">{summary}</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {item.address}</span>
        </div>
      </div>
    </div>
  );
}
