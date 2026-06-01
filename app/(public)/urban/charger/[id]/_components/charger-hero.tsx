import { Badge } from '@/components/ui/badge';
import type { UrbanItem } from '@/lib/urban/category';
import type { ChargerRaw } from '@/lib/urban/adapters/charger';

export function ChargerHero({ item }: { item: UrbanItem<ChargerRaw> }) {
  const r = item.raw;
  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">
        ⚡
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
            {item.name}
          </h1>
          <Badge tone={r.chargeSpeed === '급속' ? 'blue' : 'gray'}>{r.chargeSpeed}</Badge>
          <Badge tone="gray">{r.chargerCount}기</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {item.address}</span>
          {r.operatorName && <span>{r.operatorName}</span>}
        </div>
      </div>
    </div>
  );
}
