import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

export function StatsCards({ property: p }: { property: Property }) {
  const cards = [
    { label: '매매 평균', value: formatBillion(p.saleAvgPrice12m), count: p.saleCount12m as number | null },
    { label: '전세 평균', value: formatBillion(p.jeonseAvgDeposit12m), count: p.jeonseCount12m as number | null },
    { label: '월세 보증금', value: formatBillion(p.wolseAvgDeposit12m), count: p.wolseCount12m as number | null },
    { label: '총 거래', value: `${p.txCount12m}건`, count: null as number | null },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="!p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)]">{c.label}</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-blue-dark)]">{c.value}</p>
          {c.count !== null && <p className="text-xs text-[var(--color-muted)]">최근 1년 {c.count}건</p>}
        </Card>
      ))}
    </div>
  );
}
