import { Card } from '@/components/ui/card';
import { normalizeFees } from '@/lib/urban/parking-fees';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

export function ParkingFeeGrid({ row }: { row: ParkingRaw }) {
  const fee = normalizeFees(row);

  if (fee.free) {
    return (
      <Card id="fee">
        <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
        <div className="rounded-2xl bg-[var(--color-sky-soft)] p-6 text-center">
          <p className="text-3xl font-black text-[var(--color-blue)]">무료</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">무료 주차 — 별도 요금이 부과되지 않습니다</p>
        </div>
        {row.metpay && <p className="mt-3 text-xs text-[var(--color-muted)]">결제수단: {row.metpay}</p>}
      </Card>
    );
  }

  if (fee.items.length === 0) {
    return (
      <Card id="fee">
        <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
        <p className="rounded-2xl border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-muted)]">
          요금 정보가 등록되어 있지 않습니다.
        </p>
      </Card>
    );
  }

  return (
    <Card id="fee">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fee.items.map((f) => (
          <div key={f.label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">{f.label}</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-blue-dark)]">{f.value}</p>
          </div>
        ))}
      </div>
      {row.metpay && <p className="mt-3 text-xs text-[var(--color-muted)]">결제수단: {row.metpay}</p>}
    </Card>
  );
}
