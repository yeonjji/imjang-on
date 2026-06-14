import { Badge } from '@/components/ui/badge';
import { externalHref } from '@/lib/external-href';
import type { School } from '@prisma/client';

export function SchoolHero({ school }: { school: School }) {
  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">🏫</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{school.name}</h1>
          {school.schoolKind && <Badge tone="blue">{school.schoolKind}</Badge>}
          {school.foundType && <Badge tone="green">{school.foundType}</Badge>}
          {school.coeduType && <Badge tone="gray">{school.coeduType}</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {school.address}</span>
          {school.tel && <span>📞 {school.tel}</span>}
          {school.homepage && <a href={externalHref(school.homepage)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-blue)]">🔗 홈페이지</a>}
        </div>
      </div>
    </div>
  );
}
