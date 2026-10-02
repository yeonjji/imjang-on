import { Card } from '@/components/ui/card';
import type { SameDeptNearby } from '@/lib/hospital/context';

export function HospitalSameDept({ data }: { data: SameDeptNearby }) {
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: `반경 1km ${data.dept} ${data.typeName}`, value: `${data.total}곳`, sub: '이곳 포함' },
  ];
  // 0곳은 숨긴다: 진료시간 미공개가 많아 0을 '없음'으로 읽으면 안 된다. 분모는 타일 안에 둔다.
  if (data.withHours > 0 && data.saturday > 0) {
    tiles.push({ label: '토요일 진료', value: `${data.saturday}곳`, sub: `진료시간 공개 ${data.withHours}곳 중` });
  }
  if (data.withHours > 0 && data.night > 0) {
    tiles.push({ label: '평일 20시 넘어 진료', value: `${data.night}곳`, sub: `진료시간 공개 ${data.withHours}곳 중` });
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
      {tiles.length > 1 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">진료시간은 일부 의료기관만 공개해, 공개한 곳만 셌습니다.</p>
      )}
    </Card>
  );
}
