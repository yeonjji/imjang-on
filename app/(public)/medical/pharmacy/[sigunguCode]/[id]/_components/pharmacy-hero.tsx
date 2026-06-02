import type { PharmacyRecord } from '@/lib/pharmacy';

interface Props { pharmacy: PharmacyRecord; }

export function PharmacyHero({ pharmacy }: Props) {
  return (
    <div className="rounded-2xl bg-[var(--color-blue-dark)] p-6 text-white">
      <p className="mb-1 text-sm font-semibold opacity-75">
        약국
        {pharmacy.openedAt && ` · ${new Date(pharmacy.openedAt).getUTCFullYear()}년 개설`}
      </p>
      <h1 className="mb-3 text-3xl font-black tracking-tight">{pharmacy.name}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-90">
        <span>📍 {pharmacy.address}</span>
        {pharmacy.tel && (
          <a href={`tel:${pharmacy.tel}`} className="hover:underline">📞 {pharmacy.tel}</a>
        )}
      </div>
    </div>
  );
}
