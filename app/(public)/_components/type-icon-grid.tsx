import Link from 'next/link';

const TYPE_ICONS = [
  { icon: '🏢', label: '아파트', href: '/list?type=apt' },
  { icon: '🏬', label: '오피스텔', href: '/list?type=officetel' },
  { icon: '🏘️', label: '다세대', href: '/list?type=villa' },
  { icon: '🏫', label: '학교', href: '/school' },
  { icon: '🌳', label: '공원', href: '/urban/park' },
  { icon: '🏪', label: '전통시장', href: '/amenity/market' },
  { icon: '⚡', label: 'EV충전소', href: '/urban/charger' },
  { icon: '🏥', label: '병원/약국', href: '/medical/hospital' },
] as const;

export function TypeIconGrid() {
  return (
    <div className="grid grid-cols-4 gap-2.5 md:gap-3.5">
      {TYPE_ICONS.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--color-line)] bg-white p-3 text-center shadow-[0_8px_20px_rgba(37,99,235,0.06)] transition hover:-translate-y-0.5 hover:border-[var(--color-blue)] md:p-4"
        >
          <span className="text-xl md:text-2xl" aria-hidden>{t.icon}</span>
          <span className="text-xs font-bold text-[var(--color-blue-dark)]">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
