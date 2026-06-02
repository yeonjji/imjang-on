import Link from 'next/link';
import type { Pharmacy } from '@prisma/client';

interface Props { pharmacies: Pharmacy[]; sigunguCode: string; }

export function PharmacySidebar({ pharmacies, sigunguCode }: Props) {
  if (pharmacies.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 약국</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {pharmacies.map(p => (
          <li key={String(p.id)}>
            <Link
              href={`/medical/pharmacy/${sigunguCode}/${p.id}`}
              className="block py-2.5 text-sm transition hover:text-[var(--color-blue)]"
            >
              <p className="truncate font-semibold">{p.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{p.address}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/medical/pharmacy?region=${sigunguCode}`}
        className="mt-3 block text-center text-xs font-semibold text-[var(--color-blue)] hover:underline"
      >
        이 지역 약국 더보기 →
      </Link>
    </div>
  );
}
