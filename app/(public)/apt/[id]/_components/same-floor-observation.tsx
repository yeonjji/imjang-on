import { Card } from '@/components/ui/card';
import { formatBillion } from '@/lib/format';
import type { SameFloorPair } from '@/lib/transaction';

export function SameFloorObservation({ pair, id }: { pair: SameFloorPair | null; id?: string }) {
  if (!pair) return null;
  const pct = Math.round(pair.changePct * 10) / 10;
  const up = pct >= 0;
  const flat = Math.abs(pct) < 1;

  return (
    <Card id={id}>
      <h2 className="mb-3 text-xl font-bold text-[var(--color-blue-dark)]">동일 조건 직전 거래 비교</h2>
      <p className="text-sm text-[var(--color-text)]">
        동일{' '}
        <b className="font-bold text-[var(--color-blue-dark)]">
          {pair.pyeong}평 · {pair.floor}층
        </b>{' '}
        거래가 <b>{pair.days}일</b> 사이 {formatBillion(pair.prevPrice)}({pair.prevDate}) →{' '}
        {formatBillion(pair.recentPrice)}({pair.recentDate})로{' '}
        {flat ? (
          <b>거의 변동 없이 거래됐습니다</b>
        ) : (
          <b className="text-[var(--color-blue-dark)]">
            <span aria-hidden="true">{up ? '▲' : '▼'}</span>{' '}
            <span className="sr-only">{up ? '상승 ' : '하락 '}</span>
            {Math.abs(pct).toFixed(1)}% {up ? '상승' : '하락'}했습니다
          </b>
        )}
        .
      </p>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        같은 평형·같은 층에서 이뤄진 가장 최근 두 건입니다. 실거래가 공개자료는 동·향·라인을 제공하지 않아
        두 거래가 같은 물건인지는 확인할 수 없고, 평형은 전용면적을 평 단위로 반올림해 묶습니다.
      </p>
    </Card>
  );
}
