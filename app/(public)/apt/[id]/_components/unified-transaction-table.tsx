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

// 해제 거래: 회색 테두리 배지로 거래유형 배지(색)와 구분한다. 행 글자는 흐리게 하지 않고 금액만 취소선.
const CANCELLED_BADGE =
  'ml-1 inline-block whitespace-nowrap rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600';
const CANCELLED_NOTE = '계약 후 해제 신고된 거래예요. 시세·평균·거래 건수 통계에는 넣지 않아요.';
const NO_CANCELLED: Record<DealType, number> = { SALE: 0, JEONSE: 0, WOLSE: 0 };

function CancelledBadge() {
  return <span data-cancelled-badge className={CANCELLED_BADGE}>해제</span>;
}

function Price({ row }: { row: UnifiedTxRow }) {
  const text = formatPrice(row);
  return row.cancelled ? <s className="text-slate-500">{text}</s> : <>{text}</>;
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
  cancelledCounts = NO_CANCELLED,
  id,
}: {
  propertyId: string;
  initialRows: UnifiedTxRow[];
  /** 거래유형별 전체 건수(해제 포함 — 표에 보이는 행과 같은 기준). */
  counts: Record<DealType, number>;
  /** 거래유형별 해제 건수. 0이면 정상·해제 구분 표시를 하지 않는다. */
  cancelledCounts?: Record<DealType, number>;
  id?: string;
}) {
  const [tab, setTab] = useState<DealTab>('ALL');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UnifiedTxRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLElement>(null);

  const totalCount = tab === 'ALL' ? counts.SALE + counts.JEONSE + counts.WOLSE : counts[tab];
  const cancelledCount =
    tab === 'ALL' ? cancelledCounts.SALE + cancelledCounts.JEONSE + cancelledCounts.WOLSE : cancelledCounts[tab];
  const activeLabel = TABS.find((t) => t.key === tab)!.label;
  // 범례는 지금 보이는 행에 해제 거래가 있을 때만.
  const showNote = rows.some((r) => r.cancelled);

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
            ({activeLabel} {totalCount}건
            {cancelledCount > 0 && ` · 정상 ${totalCount - cancelledCount}건 · 해제 ${cancelledCount}건`})
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
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={dealBadgeClass(r.dealType)}>{DEAL_LABEL[r.dealType]}</span>
                    {r.cancelled && <CancelledBadge />}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{r.contractDate}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold"><Price row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 모바일: 카드 리스트 */}
          <ul className="divide-y divide-[var(--color-line)] sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className={dealBadgeClass(r.dealType)}>{DEAL_LABEL[r.dealType]}</span>
                    {r.cancelled && <CancelledBadge />}
                  </span>
                  <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">
                    {r.contractDate}
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-[var(--color-muted)]">
                  {formatPyeong(r.exclusiveArea)} · {r.floor ? `${r.floor}층` : '-'}
                </div>
                <div className="mt-0.5 font-semibold"><Price row={r} /></div>
              </li>
            ))}
          </ul>

          {showNote && (
            <p className="flex items-start gap-1.5 border-t border-[var(--color-line)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
              <span className={`${CANCELLED_BADGE} ml-0 shrink-0`}>해제</span>
              <span>{CANCELLED_NOTE}</span>
            </p>
          )}
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
