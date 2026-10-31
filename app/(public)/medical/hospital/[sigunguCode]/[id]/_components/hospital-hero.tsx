// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-hero.tsx
import { externalHref } from '@/lib/external-href';
import type { HospitalWithRelations } from '@/lib/hospital';

interface Props { hospital: HospitalWithRelations; }

export function HospitalHero({ hospital }: Props) {
  return (
    <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-soft)] md:p-7">
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-2xl md:h-16 md:w-16 md:text-3xl">🏥</div>
      <div className="min-w-0">
        <p className="mb-1 text-sm font-semibold text-[var(--color-muted)]">
          {hospital.typeName}
          {hospital.openedAt && ` · ${new Date(hospital.openedAt).getFullYear()}년 개원`}
        </p>
        <h1 className="mb-2 break-keep text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{hospital.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {hospital.address}</span>
          {hospital.tel && (
            <a href={`tel:${hospital.tel}`} className="font-semibold text-[var(--color-blue)] hover:underline">📞 {hospital.tel}</a>
          )}
          {hospital.homepage && (
            <a href={externalHref(hospital.homepage)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-blue)] hover:underline">
              🌐 홈페이지
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
