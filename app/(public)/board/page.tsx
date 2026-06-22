import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  listPublishedPosts,
  getBoardCategoryCounts,
  getBoardSourceOrgs,
} from '@/lib/board/post';
import { canViewBoard } from '@/lib/board/visibility';
import { boardPath } from '@/lib/board/slug';
import { BOARD_CATEGORIES, categoryLabel } from '@/lib/board/labels';
import type { PostCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '임장ON 브리핑',
  description:
    '금융·대출·경제·청약·부동산 분야의 공공자료 기반 이슈 해설을 매일 업데이트합니다.',
  alternates: { canonical: '/board' },
};

interface Props {
  searchParams: Promise<{ category?: string; page?: string; preview?: string }>;
}

function isCategory(v: string | undefined): v is PostCategory {
  return !!v && BOARD_CATEGORIES.some((c) => c.value === v);
}

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** 탭·레일·페이지네이션 링크. category·page·preview 토큰을 함께 보존한다. */
function buildHref(opts: { category?: PostCategory; page?: number; preview?: string }): string {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  if (opts.preview) params.set('preview', opts.preview);
  const qs = params.toString();
  return qs ? `/board?${qs}` : '/board';
}

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
    active
      ? 'bg-[var(--color-blue)] text-white'
      : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
  }`;
}

export default async function BoardListPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (!canViewBoard(sp.preview)) notFound();
  const parsedPage = Number(sp.page ?? 1);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const category = isCategory(sp.category) ? sp.category : undefined;
  // 미리보기 모드에서는 상세 링크에도 토큰을 이어붙여 404 방지.
  const previewQs = sp.preview ? `?preview=${encodeURIComponent(sp.preview)}` : '';

  const [{ rows, totalPages }, counts, orgs] = await Promise.all([
    listPublishedPosts({ page, category }),
    getBoardCategoryCounts(),
    getBoardSourceOrgs(8),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">소식</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          임장ON 브리핑
        </h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={buildHref({ preview: sp.preview })} className={chipClass(!category)}>
          전체
        </Link>
        {BOARD_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={buildHref({ category: c.value, preview: sp.preview })}
            className={chipClass(category === c.value)}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              아직 게시된 글이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden border-t-2 border-[var(--color-blue-dark)] bg-white">
              <table className="w-full table-fixed">
                <caption className="sr-only">임장ON 브리핑 목록</caption>
                <thead>
                  <tr className="border-b border-[var(--color-line)]">
                    <th scope="col" className="w-[96px] px-4 py-2.5 text-left text-xs font-bold text-[var(--color-muted)]">분류</th>
                    <th scope="col" className="px-2 py-2.5 text-left text-xs font-bold text-[var(--color-muted)]">제목</th>
                    <th scope="col" className="hidden w-[140px] px-2 py-2.5 text-left text-xs font-bold text-[var(--color-muted)] sm:table-cell">출처</th>
                    <th scope="col" className="w-[92px] px-4 py-2.5 text-right text-xs font-bold text-[var(--color-muted)]">등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.slug}
                      className="border-b border-[var(--color-line)] transition last:border-b-0 hover:bg-[var(--color-soft)]"
                    >
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-block whitespace-nowrap rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                          {categoryLabel(p.category)}
                        </span>
                      </td>
                      <td className="px-2 py-3 align-middle">
                        <Link
                          href={`${boardPath(p.id)}${previewQs}`}
                          className="block truncate text-sm font-semibold text-[var(--color-blue-dark)] hover:underline"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="hidden px-2 py-3 align-middle text-xs text-[var(--color-muted)] sm:table-cell">
                        <span className="block truncate">{p.sourceName}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right align-middle text-xs text-[var(--color-muted)]">
                        {p.publishedAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map((p) => (
                <Link
                  key={p}
                  href={buildHref({ category, page: p, preview: sp.preview })}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                    page === p
                      ? 'bg-[var(--color-blue)] text-white'
                      : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
                  }`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="mt-8 flex flex-col gap-3 lg:mt-0 lg:w-[230px] lg:shrink-0">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">이 게시판은</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">
              공공기관 보도자료·고시를 토대로 사실만 정리합니다. 전망·투자 추천은 담지 않습니다.
            </p>
          </div>

          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">분야별 글</p>
            <ul className="text-sm">
              {BOARD_CATEGORIES.map((c) => (
                <li key={c.value} className="border-t border-[var(--color-line)] first:border-t-0">
                  <Link
                    href={buildHref({ category: c.value, preview: sp.preview })}
                    className="flex items-center justify-between py-1.5 text-[var(--color-text)] transition hover:text-[var(--color-blue)]"
                  >
                    <span>{c.label}</span>
                    <span className="font-bold text-[var(--color-blue)]">{counts[c.value]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {orgs.length > 0 && (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <p className="mb-2 text-xs font-bold text-[var(--color-blue-dark)]">출처 기관</p>
              <div className="flex flex-wrap gap-1.5">
                {orgs.map((o) => (
                  <span
                    key={o}
                    className="rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-blue-dark)]"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
