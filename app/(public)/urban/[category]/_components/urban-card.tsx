import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import { isOpen24 } from '@/lib/urban/parking-hours';

export function UrbanCard({ item, def }: { item: UrbanItem; def: UrbanCategoryDef }) {
  const r = item.raw as ParkingRaw;
  const open24 = isOpen24(r.weekdayOpenHhmm, r.weekdayCloseHhmm);
  const summary = def.inferRowSummary(item);

  return (
    <Link href={`/urban/${def.slug}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.prkplceSe && <Badge tone="blue">{r.prkplceSe}</Badge>}
            {r.chargeInfo && <Badge tone={r.chargeInfo === '무료' ? 'green' : 'gray'}>{r.chargeInfo}</Badge>}
            {r.pwdbsPpkZoneYn && <Badge tone="orange">♿</Badge>}
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{item.address}</p>
          {(summary || open24) && (
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
              {summary}{summary && open24 ? ' · ' : ''}{open24 ? '24시간 ⏰' : ''}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
