import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { AreaSummaryItem } from '@/lib/transaction';

export function AreaComparison({
  areas,
  id,
}: {
  areas: AreaSummaryItem[];
  id?: string;
}) {
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
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
