import Link from 'next/link';

const HUB_ITEMS = [
  { type: 'apt', label: '아파트', desc: '단지별 매매·전세·월세 실거래가', icon: '🏢' },
  { type: 'officetel', label: '오피스텔', desc: '오피스텔 실거래가 한눈에', icon: '🏬' },
  { type: 'villa', label: '다세대', desc: '연립·다세대 실거래가', icon: '🏘️' },
] as const;

export function TypeHub() {
  return (
    <div className="flex h-full flex-col gap-4">
      {HUB_ITEMS.map((item) => (
        <Link
          key={item.type}
          href={`/list?type=${item.type}`}
          className="group flex flex-1 items-center gap-4 rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span className="text-3xl" aria-hidden>{item.icon}</span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-[var(--color-blue-dark)]">
              {item.label}
            </span>
            <span className="block text-xs text-[var(--color-muted)]">{item.desc}</span>
          </span>
          <span className="ml-auto text-[var(--color-blue)] transition group-hover:translate-x-0.5" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
