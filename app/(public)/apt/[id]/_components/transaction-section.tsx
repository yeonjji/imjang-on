'use client';

import { useState, useTransition, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { formatBillion, formatPyeong } from '@/lib/format';
import { fetchTxPage } from '../actions';
import type { DealType } from '@prisma/client';

interface Row {
  id: string;
  contractDate: string;
  exclusiveArea: number;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

interface Props {
  propertyId: string;
  dealType: DealType;
  initialRows: Row[];
  totalCount: number;
}

const PER_PAGE = 10;
const LABELS: Record<DealType, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

export function TransactionSection({ propertyId, dealType, initialRows, totalCount }: Props) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchTxPage(BigInt(propertyId), dealType, newPage);
      setRows(data);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return (
    <section ref={ref} className="mt-8">
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
        {LABELS[dealType]} 거래 내역{' '}
        <span className="text-sm font-medium text-[var(--color-muted)]">(전체 {totalCount}건)</span>
      </h2>

      {totalCount === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-muted)]">
            최근 1년 {LABELS[dealType]} 거래 내역이 없습니다.
          </p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)]">
              <tr className="text-left text-xs font-bold uppercase text-[var(--color-muted)]">
                <th className="px-4 py-3">계약일</th>
                <th className="px-4 py-3">평형</th>
                <th className="px-4 py-3">층</th>
                <th className="px-4 py-3 text-right">
                  {dealType === 'SALE' ? '거래가' : '보증금'}
                  {dealType === 'WOLSE' ? ' / 월세' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">{r.contractDate}</td>
                  <td className="px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {dealType === 'SALE' && formatBillion(r.dealAmount)}
                    {dealType === 'JEONSE' && formatBillion(r.deposit)}
                    {dealType === 'WOLSE' && r.deposit !== null && (
                      <>
                        보 {formatBillion(r.deposit)} / 월 {r.monthlyRent?.toLocaleString('ko-KR')}만원
                      </>
                    )}
                  </td>
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
