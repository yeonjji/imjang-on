import { Card } from '@/components/ui/card';
import type { School } from '@prisma/client';
import { schoolInfoRows } from '@/lib/school-display';

export function SchoolInfo({ school, regionFullName }: { school: School; regionFullName: string }) {
  const rows = schoolInfoRows(school);
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">학교 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows
          .filter((row): row is [string, string] => !!row[1])
          .map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
              <span className="text-sm text-[var(--color-muted)]">{k}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{v}</span>
            </div>
          ))}
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">지역</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{regionFullName || '-'}</span>
        </div>
      </div>
    </Card>
  );
}
