import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { displayAmenityName } from '@/lib/amenity/store-name';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityCard({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  const displayName = displayAmenityName(item, def);
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
          {/* 전통시장만 상세(detailFields)에 원문 marketType이 따로 있었다. 배지의 '분류'는
              상설/정기로 접힌 값이라 "상설+5일장" 같은 병기가 사라진다 → 원문을 카드에 남긴다. */}
          {def.slug === 'market' && item.marketType && item.marketType !== summary && (
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{item.marketType}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
