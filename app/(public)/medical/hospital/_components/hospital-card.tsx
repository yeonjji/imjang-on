import Link from 'next/link';
import type { HospitalListRow } from '@/lib/hospital';

interface Props { hospital: HospitalListRow; }

export function HospitalCard({ hospital }: Props) {
  const href = `/medical/hospital/${hospital.sigunguCode}/${hospital.id}`;
  const er = hospital.detail?.erDayOpen === 'Y' || hospital.detail?.erNightOpen === 'Y';
  const parking = hospital.detail?.parkingCapacity ?? null;
  const deptCount = hospital._count?.depts ?? 0;
  const beds =
    (hospital.facility?.generalBedPremium ?? 0) + (hospital.facility?.generalBedNormal ?? 0);
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
      {(er || deptCount > 0 || parking != null || beds > 0) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--color-muted)]">
          {er && <span className="font-semibold text-green-600">응급실</span>}
          {deptCount > 0 && <span>진료과 {deptCount}개</span>}
          {beds > 0 && <span>일반병상 {beds}개</span>}
          {parking != null && <span>주차 {parking}면</span>}
        </p>
      )}
    </Link>
  );
}
