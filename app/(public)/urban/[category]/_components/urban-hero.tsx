import { Badge } from '@/components/ui/badge';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import { isAllDayOpen24, hasAnyHours } from '@/lib/urban/parking-hours';

export function UrbanHero({ item, def }: { item: UrbanItem; def: UrbanCategoryDef }) {
  const r = item.raw as ParkingRaw;
  const hours = {
    weekdayOpen: r.weekdayOpenHhmm, weekdayClose: r.weekdayCloseHhmm,
    satOpen: r.satOpenHhmm, satClose: r.satCloseHhmm,
    holidayOpen: r.holidayOpenHhmm, holidayClose: r.holidayCloseHhmm,
  };
  const allDay24 = isAllDayOpen24(hours);
  const noHours = !hasAnyHours(hours);

  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">{def.emoji}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{item.name}</h1>
          {r.prkplceSe && <Badge tone="blue">{r.prkplceSe}</Badge>}
          {r.chargeInfo && <Badge tone={r.chargeInfo === '무료' ? 'green' : 'gray'}>{r.chargeInfo}</Badge>}
          {r.prkplceType && <Badge tone="gray">{r.prkplceType}</Badge>}
          {r.pwdbsPpkZoneYn && <Badge tone="orange">♿장애인전용</Badge>}
          {allDay24 && <Badge tone="blue">⏰ 24시간</Badge>}
          {noHours && <Badge tone="gray">운영시간 미상</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {item.address}</span>
          {r.prkcmprt != null && <span>구획 {r.prkcmprt}면</span>}
          {r.enforceSe && <span>단속 {r.enforceSe}</span>}
        </div>
      </div>
    </div>
  );
}
