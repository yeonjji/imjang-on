import Link from 'next/link';

/** 섹션 바로 아래 한 줄 '관련 분석' 링크. 항목이 없으면 그리지 않는다. */
export function SectionGuideLink({ items, className }: { items?: { slug: string; title: string }[]; className?: string }) {
  if (!items?.length) return null;
  return (
    <div className={`-mt-5 flex flex-col gap-1 ${className ?? ''}`}>
      {items.map((g) => (
        <Link
          key={g.slug}
          href={`/guide/${g.slug}`}
          className="rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-sky-soft)]"
        >
          관련 분석 · {g.title} →
        </Link>
      ))}
    </div>
  );
}
