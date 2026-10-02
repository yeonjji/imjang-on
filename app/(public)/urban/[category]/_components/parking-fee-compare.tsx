import { Card } from '@/components/ui/card';
import type { ParkingFeeComparison } from '@/lib/urban/parking-context';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function ParkingFeeCompare({ cmp, scope }: { cmp: ParkingFeeComparison; scope: string }) {
  const tiles: { label: string; value: string; sub: string }[] = [];
  if (cmp.own30 !== null && cmp.median30 !== null) {
    tiles.push({ label: '30분 요금(환산)', value: won(cmp.own30), sub: `${scope} 공영주차장 중앙값 ${won(cmp.median30)}` });
  }
  if (cmp.ownMonthly !== null && cmp.medianMonthly !== null) {
    tiles.push({ label: '월 정기권', value: won(cmp.ownMonthly), sub: `${scope} 공영주차장 중앙값 ${won(cmp.medianMonthly)}` });
  }
  if (tiles.length === 0) return null;
  return (
    <Card id="fee-compare">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">요금, 주변과 비교하면</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        기본시간 5~120분인 공영주차장의 기본요금을 30분 기준으로 환산해 비교했습니다(1일 요금 제외).
      </p>
    </Card>
  );
}
