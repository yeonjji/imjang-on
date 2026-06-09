import Link from 'next/link';

const HUB_ITEMS = [
  { type: 'apt', label: '아파트 실거래가', desc: '단지별 매매·전세·월세 실거래가', icon: '🏢', tint: 'bg-[var(--color-sky-soft)]' },
  { type: 'officetel', label: '오피스텔 실거래가', desc: '오피스텔 실거래가 한눈에', icon: '🏬', tint: 'bg-[#ede9fe]' },
  { type: 'villa', label: '다세대 실거래가', desc: '연립·다세대 실거래가', icon: '🏘️', tint: 'bg-[#dcfce7]' },
] as const;

export function TypeHub() {
  return (
    <div className="flex h-full flex-col rounded-[26px] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow)]">
      <h2 className="mb-4 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
        실거래가 보러가기
      </h2>

      <div className="flex flex-1 flex-col gap-3">
        {HUB_ITEMS.map((item) => (
          <Link
            key={item.type}
            href={`/list?type=${item.type}`}
            className="group flex min-h-[84px] flex-1 items-center gap-4 rounded-[18px] border border-[var(--color-line)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-soft)]"
          >
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl ${item.tint}`} aria-hidden>
              {item.icon}
            </span>
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
    </div>
  );
}
