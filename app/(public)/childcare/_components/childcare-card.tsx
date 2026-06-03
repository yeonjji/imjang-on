import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface ChildcareCardItem {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  crType: string | null;
  status: string | null;
  capacity: number | null;
  currentCount: number | null;
}

export function ChildcareCard({ item }: { item: ChildcareCardItem }) {
  const fillPct =
    item.capacity && item.capacity > 0 && item.currentCount != null
      ? Math.round((item.currentCount / item.capacity) * 100)
      : null;
  return (
    <Link href={`/childcare/${item.sigunguCode}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">👶</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
            {item.crType && <Badge tone="blue">{item.crType}</Badge>}
            {item.status === '휴지' && <Badge tone="gray">휴지</Badge>}
            {item.status === '재개' && <Badge tone="green">재개</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">
            {item.address}
            {item.capacity != null && <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">정원 {item.capacity}{fillPct != null ? ` · ${fillPct}%` : ''}</span>}
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
