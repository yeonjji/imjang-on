import type { HospitalWithRelations } from '@/lib/hospital';

type DoctorCounts = { general: number | null; intern: number | null; resident: number | null; specialist: number | null };

interface Props {
  depts: HospitalWithRelations['depts'];
  staff: HospitalWithRelations['staff'];
  specialties: HospitalWithRelations['specialties'];
  specialTreatments: HospitalWithRelations['specialTreatments'];
  nursingGrades: HospitalWithRelations['nursingGrades'];
  doctors: { med: DoctorCounts; dent: DoctorCounts; kor: DoctorCounts; midwife: number | null };
}

// 자격별 인원을 "전문의 N명 · 레지던트 N명 · ..." 형태로 (0/null은 생략)
function doctorParts(c: DoctorCounts): string | null {
  const parts = ([
    ['specialist', '전문의'],
    ['resident', '레지던트'],
    ['intern', '인턴'],
    ['general', '일반의'],
  ] as const)
    .filter(([k]) => (c[k] ?? 0) > 0)
    .map(([k, label]) => `${label} ${c[k]}명`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function HospitalTabDiagnosis({ depts, staff, specialties, specialTreatments, nursingGrades, doctors }: Props) {
  const doctorRows = [
    { label: '의사', parts: doctorParts(doctors.med) },
    { label: '치과의사', parts: doctorParts(doctors.dent) },
    { label: '한의사', parts: doctorParts(doctors.kor) },
  ].filter((r): r is { label: string; parts: string } => r.parts != null);
  const hasMidwife = (doctors.midwife ?? 0) > 0;

  if (!depts.length && !staff.length && !specialties.length && !specialTreatments.length && !nursingGrades.length && doctorRows.length === 0 && !hasMidwife) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">진료 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {(doctorRows.length > 0 || hasMidwife) && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">의사 인력 (자격별)</h3>
          <div className="flex flex-col gap-2">
            {doctorRows.map(r => (
              <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--color-muted)]">{r.label}</span>
                <span className="text-right font-semibold">{r.parts}</span>
              </div>
            ))}
            {hasMidwife && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--color-muted)]">조산사</span>
                <span className="font-semibold">{doctors.midwife}명</span>
              </div>
            )}
          </div>
        </section>
      )}
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
