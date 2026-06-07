'use client';

import { useState, useTransition, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { SourceCaption } from '@/components/ui/source-caption';
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

function dealBadgeClass(dealType: DealType): string {
  return `inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${DEAL_COLOR[dealType]}`;
}

function formatPrice(row: UnifiedTxRow): string {
  if (row.dealType === 'SALE') return formatBillion(row.dealAmount);
  if (row.dealType === 'JEONSE') return formatBillion(row.deposit);
  if (row.deposit != null)
    return `보 ${formatBillion(row.deposit)} / 월 ${Number(row.monthlyRent ?? 0).toLocaleString('ko-KR')}만`;
  return '-';
}

type DealTab = 'ALL' | DealType;

const TABS: { key: DealTab; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

export function UnifiedTransactionTable({
  propertyId,
  initialRows,
  counts,
  id,
}: {
  propertyId: string;
  initialRows: UnifiedTxRow[];
  counts: Record<DealType, number>;
  id?: string;
}) {
  const [tab, setTab] = useState<DealTab>('ALL');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedTxRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLElement>(null);

  const totalCount = tab === 'ALL' ? counts.SALE + counts.JEONSE + counts.WOLSE : counts[tab];
  const activeLabel = TABS.find((t) => t.key === tab)!.label;

  function changeTab(next: DealTab) {
    if (next === tab) return;
    setTab(next);
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(BigInt(propertyId), 1, next === 'ALL' ? undefined : next);
      setRows(data.rows);
      setPage(1);
    });
  }

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchUnifiedTxPage(
        BigInt(propertyId),
        newPage,
        tab === 'ALL' ? undefined : tab,
      );
      setRows(data.rows);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return (
    <section ref={ref} id={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">
          최근 실거래 내역{' '}
          <span className="text-sm font-medium text-[var(--color-muted)]">
            ({activeLabel} {totalCount}건)
          </span>
        </h2>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              disabled={pending}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-blue-dark)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {totalCount === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-muted)]">거래 내역이 없습니다.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* 태블릿 이상: 표 */}
          <table className="hidden w-full text-sm sm:table">
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
                    <span className={dealBadgeClass(r.dealType)}>{DEAL_LABEL[r.dealType]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{r.contractDate}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPrice(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 모바일: 카드 리스트 */}
          <ul className="divide-y divide-[var(--color-line)] sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={dealBadgeClass(r.dealType)}>{DEAL_LABEL[r.dealType]}</span>
                  <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                    {r.contractDate}
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-[var(--color-muted)]">
                  {formatPyeong(r.exclusiveArea)} · {r.floor ? `${r.floor}층` : '-'}
                </div>
                <div className="mt-0.5 font-semibold">{formatPrice(r)}</div>
              </li>
            ))}
          </ul>

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
      <SourceCaption ids={['molit-rtms']} />
    </section>
  );
}
