import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

const ITEMS = [
  {
    icon: '📌',
    title: '최근 매매가',
    getValue: (p: Property) =>
      p.saleLastPrice
        ? `${formatBillion(p.saleLastPrice)} · 12개월 평균 ${formatBillion(p.saleAvgPrice12m)}`
        : '최근 거래 없음',
  },
  {
    icon: '🔁',
    title: '거래 분위기',
    getValue: (p: Property) =>
      Number(p.txCount12m) > 0
        ? `최근 12개월 ${Number(p.txCount12m)}건 거래 발생`
        : '최근 12개월 거래 없음',
  },
  {
    icon: '🏠',
    title: '전세 흐름',
    getValue: (p: Property) =>
      p.jeonseLastDeposit
        ? `최근 전세 ${formatBillion(p.jeonseLastDeposit)} · 12개월 평균 ${formatBillion(p.jeonseAvgDeposit12m)}`
        : '최근 전세 거래 없음',
  },
  {
    icon: '💬',
    title: '월세 현황',
    getValue: (p: Property) =>
      p.wolseLastDeposit != null
        ? `보증금 ${formatBillion(p.wolseLastDeposit)} / 월 ${Number(p.wolseLastRent ?? 0).toLocaleString('ko-KR')}만원`
        : '최근 월세 거래 없음',
  },
] as const;

export function DealSummarySection({
  property,
  id,
}: {
  property: Property;
  id?: string;
}) {
  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">실거래가 핵심 요약</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
            <span className="text-xl">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-[var(--color-blue-dark)]">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{item.getValue(property)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
