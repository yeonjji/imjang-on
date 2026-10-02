import { Card } from '@/components/ui/card';
import type { UrbanItem } from '@/lib/urban/category';
import { formatParkArea, type ParkRaw } from '@/lib/urban/adapters/park';

export function ParkInfo({
  item,
  areaRank,
}: {
  item: UrbanItem<ParkRaw>;
  areaRank?: { rank: number; total: number; scope: string } | null;
}) {
  const r = item.raw;
  const rows: Array<[string, string | null]> = [
    ['공원 유형', r.parkType],
    ['면적', formatParkArea(r.area)],
    ['면적 순위', areaRank ? `${areaRank.scope} ${areaRank.total}곳 중 ${areaRank.rank}위` : null],
    ['지정 고시일', r.designatedAt ? r.designatedAt.toISOString().slice(0, 10) : null],
    ['관리기관', r.managingOrg],
    ['전화', r.tel],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">공원 기본정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows
          .filter((row): row is [string, string] => !!row[1])
          .map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
              <span className="text-sm text-[var(--color-muted)]">{label}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{value}</span>
            </div>
          ))}
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5 sm:col-span-2">
          <span className="text-sm text-[var(--color-muted)]">주소</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{r.address}</span>
        </div>
      </div>
    </Card>
  );
}
