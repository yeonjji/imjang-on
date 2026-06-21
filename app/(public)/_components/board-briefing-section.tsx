import Link from 'next/link';
import { isBoardPublic } from '@/lib/board/visibility';
import { getHomeLatestPosts } from '@/lib/board/post';
import { boardPath } from '@/lib/board/slug';
import { categoryLabel } from '@/lib/board/labels';

/** publishedAt → "MM.DD" (등록일 보조 표기). */
function shortDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/**
 * 상세 페이지 하단 '최신 부동산·청약·금융 소식' 섹션.
 * 카테고리 매칭 없이 PUBLISHED 글 최신 4건을 카드로 노출한다.
 * 게시판이 비공개이거나 글이 없으면 렌더하지 않는다.
 */
export async function BoardBriefingSection({ className }: { className?: string }) {
  if (!isBoardPublic()) return null;
  const posts = await getHomeLatestPosts(4);
  if (posts.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-xl font-black tracking-tight md:text-[22px]">최신 부동산·청약·금융 소식</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">공공기관 보도자료·고시를 사실 위주로 정리</p>
        </div>
        <Link href="/board" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={boardPath(p.id)}
            className="flex flex-col rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
          >
            <span className="inline-block w-fit rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
              {categoryLabel(p.category)}
            </span>
            <h3 className="mt-2.5 line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {p.title}
            </h3>
            <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-[var(--color-muted)]">
              <span className="truncate">{p.sourceName}</span>
              <span>·</span>
              <span className="whitespace-nowrap">{shortDate(p.publishedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
