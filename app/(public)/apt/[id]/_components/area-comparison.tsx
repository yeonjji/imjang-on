import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { UnitMix } from '@/lib/insights/apt-complex';
import type { AreaSummaryItem } from '@/lib/transaction';

export function AreaComparison({
  areas,
  unitMix,
  id,
}: {
  areas: AreaSummaryItem[];
  unitMix?: UnitMix | null;
  id?: string;
}) {
  // 구성만 있어도 섹션은 의미가 있다(공급 구성은 거래가 없어도 사실이다).
  if (areas.length === 0 && !unitMix) return null;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">면적별 실거래 비교</h2>
      {unitMix && (
        <div className="mb-4 rounded-2xl bg-[var(--color-sky-soft)] p-4">
          <p className="text-xs font-bold text-[var(--color-blue-dark)]">단지 구성</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--color-line)]">
            {unitMix.bands
              .filter((b) => b.pct > 0)
              .map((b, i) => (
                <div
                  key={b.label}
                  style={{ width: `${b.pct}%` }}
                  className={i % 2 === 0 ? 'bg-[var(--color-blue)]' : 'bg-[var(--color-blue-dark)]'}
                />
              ))}
          </div>
          <p className="mt-2 break-keep text-xs text-[var(--color-muted)]">
            {unitMix.bands
              .filter((b) => b.pct > 0)
              .map((b) => `${b.label} ${b.pct}%`)
              .join(' · ')}
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((item) => (
          <div key={item.area} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-sky-soft)] text-xs font-bold text-[var(--color-blue-dark)]">
              {item.area}평
            </div>
            <div>
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
                    직전 12개월 평균 대비 · 표본 {item.countPrior12m}→{item.count12m}건
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
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
