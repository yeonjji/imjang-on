import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { isBoardPublic } from '@/lib/board/visibility';
import { getHomeLatestPosts, type HomePostItem } from '@/lib/board/post';
import { boardPath } from '@/lib/board/slug';
import { canonicalizeSourceName } from '@/lib/board/source-name';
import { categoryLabel } from '@/lib/board/labels';

/** publishedAt → "MM.DD" (등록일 보조 표기). */
function shortDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/**
 * '최신 부동산·청약·금융 소식' 섹션의 순수 표현 뷰.
 * posts가 비면 렌더하지 않는다(빈 블록 금지).
 */
export function BoardBriefingView({
  posts,
  className,
  heading,
}: {
  posts: HomePostItem[];
  className?: string;
  heading?: string;
}) {
  if (posts.length === 0) return null;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">
            {heading ?? '최신 부동산·청약·금융 소식'}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">공공기관 보도자료·고시를 사실 위주로 정리</p>
        </div>
        <Link href="/board" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={boardPath(p.id)}
            className="flex flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--color-soft)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]"
          >
            <span className="inline-block w-fit rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
              {categoryLabel(p.category)}
            </span>
            <h3 className="mt-2.5 line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {p.title}
            </h3>
            <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-[var(--color-muted-on-soft)]">
              <span className="truncate">{canonicalizeSourceName(p.sourceName)}</span>
              <span>·</span>
              <span className="whitespace-nowrap">{shortDate(p.publishedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * 상세 페이지 하단 '최신 부동산·청약·금융 소식' 섹션(async 데이터 래퍼).
 * 카테고리 매칭 없이 PUBLISHED 글 최신 4건을 노출한다.
 * 게시판이 비공개이거나 글이 없으면 렌더하지 않는다.
 */
export async function BoardBriefingSection({
  className,
  excludeId,
  heading,
}: {
  className?: string;
  excludeId?: bigint;
  heading?: string;
}) {
  if (!isBoardPublic()) return null;
  const posts = await getHomeLatestPosts(4, excludeId);
  return <BoardBriefingView posts={posts} className={className} heading={heading} />;
}
