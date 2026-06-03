'use client';

import { useState, useTransition, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { formatBillion, formatPyeong } from '@/lib/format';
import { fetchUnifiedTxPage } from '../actions';
import type { UnifiedTxRow } from '@/lib/transaction';
import type { DealType } from '@prisma/client';

const PER_PAGE = 15;

const DEAL_LABEL: Record<DealType, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };
const DEAL_COLOR: Record<DealType, string> = {
  SALE: 'bg-blue-100 text-blue-700',
  JEONSE: 'bg-green-100 text-green-700',
  WOLSE: 'bg-orange-100 text-orange-700',
};

function formatPrice(row: UnifiedTxRow): string {
  if (row.dealType === 'SALE') return formatBillion(row.dealAmount);
  if (row.dealType === 'JEONSE') return formatBillion(row.deposit);
  if (row.deposit != null)
    return `보 ${formatBillion(row.deposit)} / 월 ${Number(row.monthlyRent ?? 0).toLocaleString('ko-KR')}만`;
  return '-';
}

export function UnifiedTransactionTable({
  propertyId,
  initialRows,
  totalCount,
  id,
}: {
  propertyId: string;
  initialRows: UnifiedTxRow[];
  totalCount: number;
  id?: string;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedTxRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLElement>(null);

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(BigInt(propertyId), newPage);
      setRows(data.rows);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return (
    <section ref={ref} id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
        최근 실거래 내역{' '}
        <span className="text-sm font-medium text-[var(--color-muted)]">(전체 {totalCount}건)</span>
      </h2>
      {totalCount === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-muted)]">거래 내역이 없습니다.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)]">
              <tr className="text-left text-xs font-bold uppercase text-[var(--color-muted)]">
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">계약일</th>
                <th className="px-4 py-3">평형</th>
                <th className="px-4 py-3">층</th>
                <th className="px-4 py-3 text-right">거래가</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${DEAL_COLOR[r.dealType]}`}
                    >
                      {DEAL_LABEL[r.dealType]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.contractDate}</td>
                  <td className="px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPrice(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--color-line)] px-4">
            <Pagination
              current={page}
              totalPages={Math.ceil(totalCount / PER_PAGE)}
              totalItems={totalCount}
              perPage={PER_PAGE}
              onChange={goTo}
              disabled={pending}
            />
          </div>
        </Card>
      )}
    </section>
  );
}
