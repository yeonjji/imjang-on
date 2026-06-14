import { Badge } from '@/components/ui/badge';
import { externalHref } from '@/lib/external-href';
import type { Childcare } from '@prisma/client';

export function ChildcareHero({ item }: { item: Childcare }) {
  const fillPct =
    item.capacity && item.capacity > 0 && item.currentCount != null
      ? Math.round((item.currentCount / item.capacity) * 100)
      : null;
  return (
    <div className="rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">👶</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] line-clamp-2 md:text-3xl">{item.name}</h1>
            {item.crType && <Badge tone="blue">{item.crType}</Badge>}
            {item.status === '휴지' && <Badge tone="gray">휴지</Badge>}
            {item.status === '재개' && <Badge tone="green">재개</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
            <span>📍 {item.address}</span>
            {item.tel && <span>📞 {item.tel}</span>}
            {item.homepage && <a href={externalHref(item.homepage)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-blue)]">🔗 홈페이지</a>}
          </div>
        </div>
      </div>
      {item.capacity != null && (
        <div className="mt-5 rounded-2xl bg-[var(--color-soft)] p-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-bold text-[var(--color-blue-dark)]">정원 대비 현원</span>
            <span className="font-mono text-[var(--color-muted)]">
              {item.currentCount ?? '-'} / {item.capacity}{fillPct != null && ` · ${fillPct}%`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[var(--color-blue)] transition-[width]"
              style={{ width: `${Math.min(100, fillPct ?? 0)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
