import { Card } from '@/components/ui/card';
import type { PharmacyDong } from '@/lib/pharmacy/context';

interface Props {
  years: number | null;
  openedYear: number | null;
  dong: PharmacyDong | null;
  sundayClinics: number;
}

export function PharmacyNeighborhood({ years, openedYear, dong, sundayClinics }: Props) {
  const tiles: { label: string; value: string; sub?: string }[] = [];
  if (years !== null && openedYear !== null) tiles.push({ label: '영업 연차', value: `${years}년차`, sub: `${openedYear}년 개설` });
  if (dong) tiles.push({ label: '같은 동 약국', value: `${dong.dong} 약국 ${dong.count}곳`, sub: `개설 순 ${dong.openedRank}번째` });
  if (sundayClinics > 0) tiles.push({ label: '도보권 일요일 진료', value: `${sundayClinics}곳`, sub: '반경 500m 병·의원' });
  if (tiles.length === 0) return null;
  return (
    <Card id="neighborhood">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">동네 속 이 약국</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {sundayClinics > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">일요일 진료 수는 진료시간을 공개한 병·의원 기준입니다.</p>
      )}
    </Card>
  );
}
