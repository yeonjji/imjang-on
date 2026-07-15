import { Card } from '@/components/ui/card';
import type { FloorPremium } from '@/lib/transaction';

export function FloorPremiumView({ data, id }: { data: FloorPremium | null; id?: string }) {
  if (!data) return null;
  const pct = Math.round(data.pctPerFloor * 10) / 10;
  const up = pct >= 0;

  return (
    <Card id={id}>
      <h2 className="mb-3 text-xl font-bold text-[var(--color-blue-dark)]">층별 프리미엄</h2>
      <p className="text-sm text-[var(--color-text)]">
        이 단지 <b className="text-[var(--color-blue-dark)]">{data.pyeong}평</b>은 한 층 높아질수록 ㎡당 실거래가가 평균{' '}
        <b className="text-[var(--color-blue-dark)]">
          <span aria-hidden="true">{up ? '▲' : '▼'}</span>{' '}
          <span className="sr-only">{up ? '상승 ' : '하락 '}</span>
          {Math.abs(pct).toFixed(1)}%
        </b>{' '}
        {up ? '높습니다' : '낮습니다'}.
      </p>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        매매 {data.n}건 선형회귀 · 설명력 R²={data.r2.toFixed(2)}
      </p>
    </Card>
  );
}
