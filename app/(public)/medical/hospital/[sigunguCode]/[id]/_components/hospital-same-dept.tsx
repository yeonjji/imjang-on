import { Card } from '@/components/ui/card';
import type { SameDeptNearby } from '@/lib/hospital/context';

export function HospitalSameDept({ data }: { data: SameDeptNearby }) {
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: `반경 1km ${data.dept} ${data.typeName}`, value: `${data.total}곳`, sub: '이곳 포함' },
  ];
  if (data.withHours > 0) {
    tiles.push({ label: '그중 토요일 진료', value: `${data.saturday}곳` });
    tiles.push({ label: '그중 평일 20시 이후', value: `${data.night}곳` });
  }
  return (
    <Card id="same-dept">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">같은 진료과, 이 동네에서</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {data.withHours > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">토요일·야간 진료 수는 진료시간을 공개한 {data.withHours}곳 기준입니다.</p>
      )}
    </Card>
  );
}
