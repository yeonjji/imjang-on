import Link from 'next/link';
import type { HomePostItem } from '@/lib/board/post';
import { boardPath } from '@/lib/board/slug';
import { canonicalizeSourceName } from '@/lib/board/source-name';
import { categoryLabel } from '@/lib/board/labels';

/** publishedAt → "MM.DD" (등록일 보조 표기). */
function shortDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/** 홈 맨 아래 '임장ON 브리핑': 대표글 1 + 리스트 4. 글이 없으면 렌더하지 않는다. */
export function HomeNews({ posts }: { posts: HomePostItem[] }) {
  if (posts.length === 0) return null;
  const [featured, ...rest] = posts;
  const list = rest.slice(0, 4);

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-xl font-black tracking-tight md:text-[22px]">📰 임장ON 브리핑</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">공공기관 보도자료·고시를 사실 위주로 정리</p>
        </div>
        <Link href="/board" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-5 md:grid-cols-[1.12fr_0.88fr] md:items-stretch">
        {/* 대표(최신 1건) */}
        <Link
          href={boardPath(featured.id)}
          className="flex flex-col rounded-[20px] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
        >
          <span className="inline-block w-fit rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
            {categoryLabel(featured.category)}
          </span>
          <h3 className="mt-2.5 text-[17px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)] md:text-lg">
            {featured.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--color-text)]">
            {featured.summary}
          </p>
          <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-[var(--color-muted)]">
            <span className="truncate">{canonicalizeSourceName(featured.sourceName)}</span>
            <span>·</span>
            <span className="whitespace-nowrap">{shortDate(featured.publishedAt)}</span>
          </span>
        </Link>

        {/* 리스트(다음 4건) */}
        {list.length > 0 && (
          <ul className="rounded-[20px] border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-soft)]">
            {list.map((p) => (
              <li key={p.slug} className="border-b border-[var(--color-line)] last:border-0">
                <Link
                  href={boardPath(p.id)}
                  className="flex items-center gap-2.5 px-2 py-3 transition hover:bg-[var(--color-soft)]"
                >
                  <span className="inline-block flex-none rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                    {categoryLabel(p.category)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-blue-dark)]">
                    {p.title}
                  </span>
                  <span className="flex-none whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                    {shortDate(p.publishedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
