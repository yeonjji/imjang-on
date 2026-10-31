import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { Pharmacy } from '@prisma/client';

interface Props { pharmacy: Pharmacy; }

export function PharmacyCard({ pharmacy }: Props) {
  const href = `/medical/pharmacy/${pharmacy.sigunguCode}/${pharmacy.id}`;
  return (
    <Link prefetch={false}
      href={href}
      className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]"
    >
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--color-sky-soft)] text-2xl">💊</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{pharmacy.name}</h3>
          <Badge tone="blue">약국</Badge>
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">
          {pharmacy.address}
          {pharmacy.tel ? ` · ${pharmacy.tel}` : ''}
        </p>
        {pharmacy.openedAt && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            개설 {new Date(pharmacy.openedAt).getUTCFullYear()}년
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
    </Link>
  );
}
