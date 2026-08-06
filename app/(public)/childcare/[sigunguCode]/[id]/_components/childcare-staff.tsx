import { DetailsCard } from '@/components/ui/details-card';
import { childcareCount } from '@/lib/childcare';
import type { Childcare } from '@prisma/client';

const ROLES = [
  ['emRoleDirector', '원장'], ['emRoleTeacher', '보육교사'], ['emRoleSpecial', '특수교사'],
  ['emRoleTherapy', '치료교사'], ['emRoleNutrition', '영양사'], ['emRoleNurse', '간호사'],
  ['emRoleNurseAssist', '간호조무사'], ['emRoleCook', '조리원'], ['emRoleOffice', '사무직원'],
] as const;
const TENURES = [
  ['emTenure0y', '1년 미만'], ['emTenure1y', '1~2년'], ['emTenure2y', '2~4년'],
  ['emTenure4y', '4~6년'], ['emTenure6y', '6년 이상'],
] as const;

export function ChildcareStaff({ item }: { item: Childcare }) {
  const roleRows = ROLES.map(([k, label]) => ({ label, v: childcareCount(item, k) })).filter((r) => r.v != null && r.v > 0);
  const tenRows = TENURES.map(([k, label]) => ({ label, v: childcareCount(item, k) })).filter((r) => r.v != null);
  if (roleRows.length === 0 && tenRows.length === 0) return null;
  const summary = item.emRoleTot != null ? `총 ${item.emRoleTot}명` : `총 ${item.staffCount ?? '-'}명`;
  return (
    <DetailsCard id="staff" title="교직원" summary={summary}>
      <div className="flex flex-col gap-5">
        {roleRows.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-blue-dark)]">직역별</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {roleRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
                  <span className="text-[var(--color-muted)]">{r.label}</span>
                  <span className="font-mono font-bold text-[var(--color-blue-dark)]">{r.v}명</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tenRows.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-blue-dark)]">근속년수별</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {tenRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
                  <span className="text-[var(--color-muted)]">{r.label}</span>
                  {/* 원본(어린이집통합정보) em_cnt_*y는 인원이 아니라 비율(%)이다 — 합이 100. */}
                  <span className="font-mono font-bold text-[var(--color-blue-dark)]">{r.v}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetailsCard>
  );
}
