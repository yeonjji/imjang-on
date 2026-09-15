import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { AreaSummaryItem } from '@/lib/transaction';

/**
 * 면적 구성 막대는 여기 없다 — 「단지 정보」 섹션이 담당한다(2026-09-15).
 * 실거래가 한 건도 없는 단지에서 구성만 남으면 "실거래 비교"라는 제목이
 * 내용과 어긋났다(실측 796건, 매칭 단지의 6.7%).
 */
export function AreaComparison({ areas, id }: { areas: AreaSummaryItem[]; id?: string }) {
  if (areas.length === 0) return null;

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">면적별 실거래 비교</h2>
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
