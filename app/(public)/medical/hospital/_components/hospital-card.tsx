import Link from 'next/link';
import type { Hospital } from '@prisma/client';

interface Props { hospital: Hospital; }

export function HospitalCard({ hospital }: Props) {
  const href = `/medical/hospital/${hospital.sigunguCode}/${hospital.id}`;
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-blue)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-bold text-[var(--color-blue-dark)]">{hospital.name}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-blue)]">
          {hospital.typeName}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{hospital.address}</p>
      {hospital.tel && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{hospital.tel}</p>
      )}
      {(hospital.totalDoctors || hospital.openedAt) && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {hospital.totalDoctors ? `의사 ${hospital.totalDoctors}명` : ''}
          {hospital.totalDoctors && hospital.openedAt ? ' · ' : ''}
          {hospital.openedAt ? `${new Date(hospital.openedAt).getUTCFullYear()}년 개원` : ''}
        </p>
      )}
    </Link>
  );
}
