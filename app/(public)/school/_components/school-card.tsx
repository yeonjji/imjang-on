import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { School } from '@prisma/client';

export function SchoolCard({ school }: { school: School }) {
  return (
    <Link href={`/school/${school.sigunguCode}/${school.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">🏫</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{school.name}</h3>
            {school.schoolKind && <Badge tone="blue">{school.schoolKind}</Badge>}
            {school.foundType && <Badge tone="green">{school.foundType}</Badge>}
            {school.coeduType && <Badge tone="gray">{school.coeduType}</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{school.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
