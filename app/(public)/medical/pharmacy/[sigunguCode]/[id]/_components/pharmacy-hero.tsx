import type { PharmacyRecord } from '@/lib/pharmacy';

interface Props { pharmacy: PharmacyRecord; }

export function PharmacyHero({ pharmacy }: Props) {
  return (
    <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-soft)] md:p-7">
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-2xl md:h-16 md:w-16 md:text-3xl">💊</div>
      <div className="min-w-0">
        <p className="mb-1 text-sm font-semibold text-[var(--color-muted)]">
          약국
          {pharmacy.openedAt && ` · ${new Date(pharmacy.openedAt).getUTCFullYear()}년 개설`}
        </p>
        <h1 className="mb-2 break-keep text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{pharmacy.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {pharmacy.address}</span>
          {pharmacy.tel && (
            <a href={`tel:${pharmacy.tel}`} className="font-semibold text-[var(--color-blue)] hover:underline">📞 {pharmacy.tel}</a>
          )}
        </div>
      </div>
    </div>
  );
}
