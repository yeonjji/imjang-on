import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { lineBadge } from '@/lib/subway/line-colors';
import type { NearbySubwayResult, NearbySubwayStation } from '@/lib/subway/nearby';

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}
function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 67));
}

export function NearbySubway({ data }: { data: NearbySubwayResult }) {
  if (data.stations.length === 0) return null;
  const { stations, fallback } = data;
  const transferCount = stations.filter((s) => s.isTransfer).length;
  const lineCount = new Set(stations.flatMap((s) => s.lines)).size;

  return (
    <Card id="subway">
      <div className="mb-3.5 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">🚇 근처 지하철역</h2>
        <span className="text-xs text-[var(--color-muted)]">
          {fallback ? '가장 가까운 역' : '반경 800m · 가까운 순'}
        </span>
      </div>

      {fallback ? (
        <div className="mb-3 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-soft)] px-3.5 py-3 text-sm text-[var(--color-muted)]">
          반경 800m 내 지하철역이 없습니다. <b className="text-[var(--color-blue-dark)]">가장 가까운 역</b>을 안내해 드려요.
        </div>
      ) : (
        <div className="mb-3 flex gap-2 overflow-x-auto border-b border-[var(--color-line)] pb-3.5">
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">
            🚇 {stations.length}개 역 <span className="text-[var(--color-blue)]">· 최단 {formatDistance(stations[0].distanceMeters)}</span>
          </span>
          {transferCount > 0 && (
            <span className="flex shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">환승역 {transferCount}곳</span>
          )}
          <span className="flex shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">노선 {lineCount}개</span>
        </div>
      )}

      <ul>
        {stations.map((s) => (
          <StationRow key={s.id} station={s} />
        ))}
      </ul>

      <SourceCaption ids={['subway']} />
    </Card>
  );
}

function StationRow({ station }: { station: NearbySubwayStation }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 gap-1">
          {station.lines.map((ln) => {
            const b = lineBadge(ln);
            return (
              <span
                key={ln}
                className="flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: b.color }}
              >
                {b.label}
              </span>
            );
          })}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--color-text)]">
            {station.name}
            {station.isTransfer && (
              <span className="ml-1.5 rounded-md bg-[#fde7f0] px-1.5 py-0.5 text-[11px] font-bold text-[#E6186C]">환승</span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">{station.lines.join(' · ')}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="rounded-full bg-[var(--color-sky-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
          {formatDistance(station.distanceMeters)}
        </span>
        <span className="text-[11px] text-[var(--color-muted)]">도보 {walkMinutes(station.distanceMeters)}분</span>
      </div>
    </li>
  );
}
