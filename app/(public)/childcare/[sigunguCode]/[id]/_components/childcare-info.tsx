import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';

function fmtDate(d: Date | null): string {
  if (!d) return '-';
  return d.toISOString().slice(0, 10);
}

export function ChildcareInfo({ item, regionFullName }: { item: Childcare; regionFullName: string }) {
  const rows: [string, string | null][] = [
    ['지역', regionFullName],
    ['주소', item.address],
    ['전화', item.tel],
    ['팩스', item.fax],
    ['홈페이지', item.homepage],
    ['대표자', item.repName],
    ['인가일', fmtDate(item.confirmDate)],
    ['통학차량', item.vehicleOp],
    ['제공서비스', item.services],
    ['운영상태', item.status ?? '정상'],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">기본 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{k}</span>
            <span className="ml-2 truncate text-sm font-semibold text-[var(--color-text)]" title={v ?? '-'}>{v ?? '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
