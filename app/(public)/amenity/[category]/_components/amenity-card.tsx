import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { displayStoreName } from '@/lib/amenity/store-name';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityCard({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  // 브랜드 접두 분리는 소수 브랜드가 지배하는 편의점에서만 의미가 있다.
  const displayName = displayStoreName(item, { splitBrand: def.slug === 'convenience' });
  return (
    <Link href={`/amenity/${def.slug}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{displayName}</h3>
            {summary && <Badge tone="blue">{summary}</Badge>}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-muted)]">{item.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
