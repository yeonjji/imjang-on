import type { HospitalWithRelations } from '@/lib/hospital';

interface Props {
  depts: HospitalWithRelations['depts'];
  staff: HospitalWithRelations['staff'];
  specialties: HospitalWithRelations['specialties'];
  specialTreatments: HospitalWithRelations['specialTreatments'];
  nursingGrades: HospitalWithRelations['nursingGrades'];
}

export function HospitalTabDiagnosis({ depts, staff, specialties, specialTreatments, nursingGrades }: Props) {
  if (!depts.length && !staff.length && !specialties.length && !specialTreatments.length && !nursingGrades.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">진료 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {depts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료과목 ({depts.length}개)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {depts.map(d => (
              <div key={String(d.id)} className="flex items-center justify-between rounded-lg bg-[var(--color-soft)] px-3 py-2 text-sm">
                <span>{d.deptName}</span>
                {d.specialistCount != null && (
                  <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                    전문의 {d.specialistCount}명
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {staff.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">의료진 구성</h3>
          <div className="flex flex-wrap gap-2">
            {staff.map(s => (
              <span key={String(s.id)} className="rounded-lg bg-[var(--color-soft)] px-3 py-1.5 text-sm">
                {s.staffName}{s.staffCount != null ? ` ${s.staffCount}명` : ''}
              </span>
            ))}
          </div>
        </section>
      )}
      {specialties.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">특수클리닉</h3>
          <div className="flex flex-wrap gap-2">
            {specialties.map(s => (
              <span key={String(s.id)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs">{s.searchName}</span>
            ))}
          </div>
        </section>
      )}
      {specialTreatments.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">특수치료</h3>
          <div className="flex flex-wrap gap-2">
            {specialTreatments.map(s => (
              <span key={String(s.id)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs">{s.searchName}</span>
            ))}
          </div>
        </section>
      )}
      {nursingGrades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">간호등급</h3>
          <div className="flex flex-col gap-2">
            {nursingGrades.map(n => (
              <div key={String(n.id)} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted)]">{n.typeName}</span>
                {n.nursingGrade && <span className="font-semibold">{n.nursingGrade}등급</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
