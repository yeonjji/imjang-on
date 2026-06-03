import Link from 'next/link';
import type { Pharmacy } from '@prisma/client';

interface Props { pharmacy: Pharmacy; }

export function PharmacyCard({ pharmacy }: Props) {
  const href = `/medical/pharmacy/${pharmacy.sigunguCode}/${pharmacy.id}`;
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-blue)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-bold text-[var(--color-blue-dark)]">{pharmacy.name}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-blue)]">
          약국
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{pharmacy.address}</p>
      {pharmacy.tel && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{pharmacy.tel}</p>
      )}
    </Link>
  );
}
