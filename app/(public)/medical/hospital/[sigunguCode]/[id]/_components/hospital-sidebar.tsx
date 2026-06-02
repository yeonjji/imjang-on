import Link from 'next/link';
import type { Hospital } from '@prisma/client';

interface Props { hospitals: Hospital[]; sigunguCode: string; }

export function HospitalSidebar({ hospitals, sigunguCode }: Props) {
  if (hospitals.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 병원</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {hospitals.map(h => (
          <li key={String(h.id)}>
            <Link
              href={`/medical/hospital/${sigunguCode}/${h.id}`}
              className="block py-2.5 text-sm transition hover:text-[var(--color-blue)]"
            >
              <p className="truncate font-semibold">{h.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{h.typeName}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/medical/hospital?region=${sigunguCode}`}
        className="mt-3 block text-center text-xs font-semibold text-[var(--color-blue)] hover:underline"
      >
        이 지역 병원 더보기 →
      </Link>
    </div>
  );
}
