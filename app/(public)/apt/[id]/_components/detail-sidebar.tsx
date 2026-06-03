import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

const ANCHORS = [
  { href: '#summary', label: '핵심 요약' },
  { href: '#transactions', label: '최근 실거래' },
  { href: '#chart', label: '가격 그래프' },
  { href: '#area', label: '면적별 비교' },
  { href: '#nearby', label: '주변 단지 비교' },
  { href: '#poi', label: '주변 생활 인프라' },
];

export function DetailSidebar({ property }: { property: Property }) {
  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">실거래 요약</h3>
        <ul className="space-y-1 text-sm text-[var(--color-muted)]">
          <li>매매 최근 {formatBillion(property.saleLastPrice)}</li>
          <li>전세 최근 {formatBillion(property.jeonseLastDeposit)}</li>
          <li>12개월 거래 {Number(property.txCount12m)}건</li>
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
        <ul className="flex flex-col gap-2">
          {ANCHORS.map((a) => (
            <li key={a.href}>
              <a
                href={a.href}
                className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
              >
                {a.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
