import Link from 'next/link';

interface Props {
  emoji: string;
  title: string;
  desc: string;
  href?: string;
}

export function CategoryCard({ emoji, title, desc, href }: Props) {
  const inner = (
    <div className={`flex flex-col items-center gap-2 rounded-[22px] border border-[var(--color-line)] bg-white p-7 text-center shadow-[var(--shadow-soft)] transition ${href ? 'hover:border-[var(--color-sky)] hover:-translate-y-0.5' : 'opacity-60'}`}>
      <span className="text-4xl">{emoji}</span>
      <p className="text-base font-bold text-[var(--color-blue-dark)]">{title}</p>
      <p className="text-xs text-[var(--color-muted)]">{desc}</p>
      {!href && <span className="mt-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">준비중</span>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
