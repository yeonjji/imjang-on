import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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
    <Link prefetch={false}
      href={href}
      className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]"
    >
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--color-sky-soft)] text-2xl">🏥</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{hospital.name}</h3>
          <Badge tone="blue">{hospital.typeName}</Badge>
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">
          {hospital.address}
          {hospital.tel ? ` · ${hospital.tel}` : ''}
        </p>
        {(hospital.totalDoctors || hospital.openedAt) && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {hospital.totalDoctors ? `의사 ${hospital.totalDoctors}명` : ''}
            {hospital.totalDoctors && hospital.openedAt ? ' · ' : ''}
            {hospital.openedAt ? `${new Date(hospital.openedAt).getUTCFullYear()}년 개원` : ''}
          </p>
        )}
        {(er || deptCount > 0 || parking != null || beds > 0) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--color-muted)]">
            {er && <span className="font-bold text-[var(--color-green)]">응급실 운영</span>}
            {deptCount > 0 && <span>진료과 {deptCount}개</span>}
            {beds > 0 && <span>일반병상 {beds}개</span>}
            {parking != null && <span>주차 {parking}면</span>}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
    </Link>
  );
}
