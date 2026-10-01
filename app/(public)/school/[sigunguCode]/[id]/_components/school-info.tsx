import { Card } from '@/components/ui/card';
import type { School } from '@prisma/client';
import { isHighSchool, formatYmd, formatYmdKo } from '@/lib/school-display';

export function SchoolInfo({ school, regionFullName }: { school: School; regionFullName: string }) {
  const high = isHighSchool(school.schoolKind);
  // '일반계'는 일반고에선 중복, 특목고에선 모순처럼 읽혀 붙이지 않는다. 전문계 등만 덧붙인다.
  const track = school.hsTrack && school.hsTrack !== '일반계' ? school.hsTrack : null;
  const hsTypeTrack = [school.hsType, track].filter(Boolean).join(' · ') || null;
  const rows: [string, string | null][] = [
    ['학교급', school.schoolKind],
    ['설립유형', school.foundType],
    ['남녀공학', school.coeduType],
    ...(high
      ? ([
          ['고교 유형', hsTypeTrack],
          ['특목고 계열', school.specialPurpose],
          ['입학 전형', school.admissionPeriod],
        ] as [string, string | null][])
      : []),
    ['설립일', formatYmd(school.foundedAt)],
    ['개교일', formatYmdKo(school.anniversaryAt)],
    ['관할 교육청', school.eduOffice],
    ['전화', school.tel],
  ];
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
