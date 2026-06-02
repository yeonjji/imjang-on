// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-hero.tsx
import type { HospitalWithRelations } from '@/lib/hospital';

interface Props { hospital: HospitalWithRelations; }

export function HospitalHero({ hospital }: Props) {
  return (
    <div className="rounded-2xl bg-[var(--color-blue-dark)] p-6 text-white">
      <p className="mb-1 text-sm font-semibold opacity-75">
        {hospital.typeName}
        {hospital.openedAt && ` · ${new Date(hospital.openedAt).getFullYear()}년 개원`}
      </p>
      <h1 className="mb-3 text-3xl font-black tracking-tight">{hospital.name}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-90">
        <span>📍 {hospital.address}</span>
        {hospital.tel && (
          <a href={`tel:${hospital.tel}`} className="hover:underline">📞 {hospital.tel}</a>
        )}
        {hospital.homepage && (
          <a href={hospital.homepage} target="_blank" rel="noopener noreferrer" className="hover:underline">
            🌐 홈페이지
          </a>
        )}
      </div>
    </div>
  );
}
