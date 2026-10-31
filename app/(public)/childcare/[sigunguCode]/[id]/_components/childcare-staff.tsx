import { DetailsCard } from '@/components/ui/details-card';
import { childcareStaffRows } from '@/lib/childcare';
import type { Childcare } from '@prisma/client';


export function ChildcareStaff({ item }: { item: Childcare }) {
  const { roleRows, tenRows } = childcareStaffRows(item);
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
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-blue-dark)]">근속년수별 비율</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {tenRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
                  <span className="text-[var(--color-muted)]">{r.label}</span>
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
