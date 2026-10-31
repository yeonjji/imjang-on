import type { HospitalWithRelations } from '@/lib/hospital';
import { hospitalVisibleBeds } from '@/lib/hospital/display';


interface Props {
  facility: HospitalWithRelations['facility'];
  equipment: HospitalWithRelations['equipment'];
  mealSurcharges: HospitalWithRelations['mealSurcharges'];
}

export function HospitalTabFacility({ facility, equipment, mealSurcharges }: Props) {
  if (!facility && !equipment.length && !mealSurcharges.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">시설·장비 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {facility && (
        <section>
          {facility.foundTypeName && (
            <p className="mb-3 text-sm text-[var(--color-muted)]">
              설립구분: <span className="font-semibold text-[var(--color-blue-dark)]">{facility.foundTypeName}</span>
            </p>
          )}
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">병상 현황</h3>
          <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            {hospitalVisibleBeds(facility).map(r => (
              <div key={r.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-[var(--color-muted)]">{r.label}</span>
                <span className="font-semibold">{(facility[r.key] as number).toLocaleString()}개</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {equipment.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">의료장비 ({equipment.length}종)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {equipment.map(e => (
              <div key={String(e.id)} className="flex items-center justify-between rounded-lg bg-[var(--color-soft)] px-3 py-2 text-sm">
                <span>{e.equipName}</span>
                {e.equipCount != null && <span className="text-[var(--color-muted)]">{e.equipCount}대</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      {mealSurcharges.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">식대가산</h3>
          <div className="flex flex-col gap-2">
            {mealSurcharges.map(m => (
              <div key={String(m.id)} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted)]">{m.typeName}</span>
                {m.treatmentGrade && <span className="font-semibold">{m.treatmentGrade}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
