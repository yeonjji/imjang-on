import { Card } from '@/components/ui/card';
import { facilityKindLabel, floorLabel, maxOutputKw, installYearRange } from '@/lib/urban/charger-display';

interface GuideRaw {
  useTime: string | null;
  parkingFree: boolean | null;
  floorType: string | null;
  floorNum: number | null;
  facilityKind: string | null;
  operatorTel: string | null;
  locationDetail: string | null;
}

export function ChargerGuide({
  raw,
  units,
}: {
  raw: GuideRaw;
  units: { outputKw?: number | null; installYear?: number | null }[];
}) {
  const maxKw = maxOutputKw(units);
  const floor = floorLabel(raw.floorType, raw.floorNum);
  const tiles: { label: string; value: string }[] = [];
  if (raw.useTime) tiles.push({ label: '이용 시간', value: raw.useTime });
  if (maxKw !== null) tiles.push({ label: '출력', value: `최대 ${maxKw}kW` });
  if (raw.parkingFree !== null) tiles.push({ label: '주차료', value: raw.parkingFree ? '무료' : '유료' });
  if (floor) tiles.push({ label: '설치 위치', value: floor });

  const rows: [string, string | null][] = [
    ['시설 구분', facilityKindLabel(raw.facilityKind)],
    ['운영사 연락처', raw.operatorTel],
    ['설치 연도', installYearRange(units)],
    ['상세 위치', raw.locationDetail],
  ];
  const shownRows = rows.filter((r): r is [string, string] => !!r[1]);
  if (tiles.length === 0 && shownRows.length === 0) return null;

  return (
    <Card id="guide">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">이용 안내</h2>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
              <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
              <p className="mt-1.5 text-base font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            </div>
          ))}
        </div>
      )}
      {shownRows.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {shownRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-2.5">
              <dt className="shrink-0 text-sm text-[var(--color-muted)]">{k}</dt>
              <dd className="text-right text-sm font-semibold text-[var(--color-text)]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
