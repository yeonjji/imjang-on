import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { AreaSummaryItem } from '@/lib/transaction';
import { manwonPerSqm, signedPct, type AreaRegionRow } from '@/lib/apt-region/compare';

/**
 * 면적 구성 막대는 여기 없다 — 「단지 정보」 섹션이 담당한다(2026-09-15).
 * 실거래가 한 건도 없는 단지에서 구성만 남으면 "실거래 비교"라는 제목이
 * 내용과 어긋났다(실측 796건, 매칭 단지의 6.7%).
 *
 * regionRows(아파트만): 평형별로 시군구 같은 면적대 ㎡당 가격 분포 안의 위치. 표본이 모자란 평형은 키가 없다.
 */
export function AreaComparison({
  areas,
  id,
  regionRows,
  regionLabel,
}: {
  areas: AreaSummaryItem[];
  id?: string;
  regionRows?: Record<number, AreaRegionRow>;
  regionLabel?: string;
}) {
  if (areas.length === 0) return null;
  const hasRegion = !!regionRows && Object.keys(regionRows).length > 0;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">면적별 실거래 비교</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((item) => {
          const r = regionRows?.[item.area];
          return (
            <div key={item.area} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sky-soft)] text-xs font-bold text-[var(--color-blue-dark)]">
                {item.area}평
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--color-blue-dark)]">
                  최근 매매 {formatBillion(item.lastPrice)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  12개월 평균 {formatBillion(item.avg12m)} · {item.count12m}건
                </p>
                {item.changePct12m != null && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--color-blue-dark)]">
                    <span aria-hidden="true">{item.changePct12m >= 0 ? '▲' : '▼'}</span>{' '}
                    <span className="sr-only">{item.changePct12m >= 0 ? '상승 ' : '하락 '}</span>
                    {Math.abs(item.changePct12m).toFixed(1)}%
                    <span className="ml-1 font-normal text-[var(--color-muted)]">
                      직전 12개월 대비(㎡당 중간값) · 표본 {item.countPrior12m}→{item.count12m}건
                    </span>
                  </p>
                )}
                {item.jeonseRatioPct != null && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    전세가율 <b className="text-[var(--color-blue-dark)]">{item.jeonseRatioPct.toFixed(0)}%</b>
                    {item.gap12m != null && <> · 갭 {formatBillion(item.gap12m)}</>}
                    <span className="ml-1">(전세 {item.jeonseCount12m}건)</span>
                  </p>
                )}
                {r && regionLabel && <RegionPosition row={r} label={regionLabel} />}
              </div>
            </div>
          );
        })}
      </div>
      {hasRegion && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          막대는 {regionLabel} 같은 면적대 아파트의 최근 12개월 매매 ㎡당 가격입니다. 선은 10~90%, 진한 칸은 25~75%,
          세로선은 중간값, 점은 이 단지 평형의 ㎡당 중간값입니다. 단지 평형 매매가 3건 미만이면 표시하지 않습니다.
        </p>
      )}
    </Card>
  );
}

function RegionPosition({ row, label }: { row: AreaRegionRow; label: string }) {
  const [p10, p25, p50, p75, p90] = row.dist;
  const span = p90 - p10;
  const at = (v: number) => `${span > 0 ? Math.min(100, Math.max(0, ((v - p10) / span) * 100)) : 50}%`;
  return (
    <div className="mt-2 rounded-xl bg-[var(--color-card)] px-3 py-2">
      <p className="flex flex-wrap justify-between gap-x-3 text-xs">
        <b className="text-[var(--color-blue-dark)]">
          {label} 같은 면적대({row.bandLabel}) 중 {row.position}
        </b>
        {row.regionChangePct != null && (
          <span className="text-[var(--color-muted)]">지역 변동 {signedPct(row.regionChangePct)}</span>
        )}
      </p>
      <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">
        ㎡당 이 평형 {manwonPerSqm(row.ppa)} · 지역 중간값 {manwonPerSqm(p50)}
      </p>
      <div className="relative mt-2 h-4" aria-hidden="true">
        <div className="absolute inset-x-0 top-[7px] h-0.5 bg-[var(--color-line)]" />
        <div
          className="absolute top-1 h-2 rounded bg-[var(--color-sky-soft)]"
          style={{ left: at(p25), width: `calc(${at(p75)} - ${at(p25)})` }}
        />
        <div className="absolute top-0.5 h-3 w-0.5 bg-[var(--color-blue-dark)]" style={{ left: at(p50) }} />
        <div
          className="absolute top-0 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-[var(--color-card)] bg-[var(--color-blue)]"
          style={{ left: at(row.ppa) }}
        />
      </div>
      <p className="mt-1 flex justify-between text-xs text-[var(--color-muted)]">
        <span>{manwonPerSqm(p10)}</span>
        <span>{manwonPerSqm(p90)}</span>
      </p>
    </div>
  );
}
