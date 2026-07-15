import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { TransactionFlags } from '@/lib/transaction';

export function TransactionFlagsView({ data, id }: { data: TransactionFlags | null; id?: string }) {
  if (!data) return null;
  const top = data.topAnomaly;
  const dev = top ? Math.round(top.deviationPct * 10) / 10 : 0;

  return (
    <Card id={id}>
      <h2 className="mb-3 text-xl font-bold text-[var(--color-blue-dark)]">거래 데이터 특이사항</h2>
      {data.cancelledCount12m > 0 && (
        <p className="text-sm text-[var(--color-text)]">
          최근 12개월 <b className="text-[var(--color-blue-dark)]">해제 신고 {data.cancelledCount12m}건</b>은 통계에서 제외했습니다.
        </p>
      )}
      {data.anomalyCount12m > 0 && (
        <p className="mt-1 text-sm text-[var(--color-text)]">
          동일 평형 12개월 중앙값 대비 ±10%를 벗어난 매매{' '}
          <b className="text-[var(--color-blue-dark)]">{data.anomalyCount12m}건</b>을 자동 플래그했습니다
          {top && (
            <>
              {' '}(예: {top.pyeong}평 {top.date} {formatBillion(top.price)} · 중앙값 대비 {dev >= 0 ? '+' : '−'}
              {Math.abs(dev).toFixed(1)}%)
            </>
          )}
          .
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        자동 이상치 탐지 · 통계 수치에는 해제 건을 제외한 값만 반영됩니다.
      </p>
    </Card>
  );
}
