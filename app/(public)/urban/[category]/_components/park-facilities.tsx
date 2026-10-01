import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { parkFacilityGroups } from '@/lib/urban/park-display';

export function ParkFacilities({ item }: { item: UrbanItem<ParkRaw> }) {
  const groups = parkFacilityGroups(item.raw);
  if (groups.length === 0) return null;
  return (
    <Card id="facilities">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 시설</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <h3 className="mb-2.5 text-sm font-bold text-[var(--color-text)]">{g.label}</h3>
            <ul className="flex flex-wrap gap-2">
              {g.items.map((it) => (
                <li
                  key={it}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1.5 text-sm font-semibold text-[var(--color-blue-dark)]"
                >{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
