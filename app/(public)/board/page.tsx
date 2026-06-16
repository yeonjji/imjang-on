import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listPublishedPosts } from '@/lib/board/post';
import { canViewBoard } from '@/lib/board/visibility';
import { BOARD_CATEGORIES, categoryLabel } from '@/lib/board/labels';
import type { PostCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '소식 — 금융·부동산 이슈 해설',
  description: '금융·대출·경제·청약·부동산 분야의 공공자료 기반 이슈 해설을 매일 업데이트합니다.',
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

export default async function BoardListPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (!canViewBoard(sp.preview)) notFound();
  const page = Math.max(1, Number(sp.page ?? 1));
  const category = isCategory(sp.category) ? sp.category : undefined;
  // 미리보기 모드에서는 상세 링크에도 토큰을 이어붙여 404 방지.
  const previewQs = sp.preview ? `?preview=${encodeURIComponent(sp.preview)}` : '';

  const { rows, totalPages } = await listPublishedPosts({ page, category });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">소식</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          금융·부동산 이슈 해설
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          공공기관 자료에 근거한 사실 정보입니다. 전망·추천은 포함하지 않습니다.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/board"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !category
              ? 'bg-[var(--color-blue)] text-white'
              : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
          }`}
        >
          전체
        </Link>
        {BOARD_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/board?category=${c.value}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              category === c.value
                ? 'bg-[var(--color-blue)] text-white'
                : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          아직 게시된 글이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <Link
              key={p.slug}
              href={`/board/${p.slug}${previewQs}`}
              className="block rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/board/${p.slug}/thumbnail`}
                alt=""
                width={1200}
                height={630}
                loading="lazy"
                className="mb-3 aspect-[1200/630] w-full rounded-[14px] border border-[var(--color-line)] object-cover"
              />
              <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                {categoryLabel(p.category)}
              </span>
              <h2 className="mt-2 text-lg font-bold text-[var(--color-blue-dark)]">{p.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-muted)]">{p.summary}</p>
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                기준일 {p.sourceDate.toISOString().slice(0, 10)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {pageNums(page, totalPages).map((p) => {
            const params = new URLSearchParams();
            if (category) params.set('category', category);
            params.set('page', String(p));
            return (
              <Link
                key={p}
                href={`/board?${params.toString()}`}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                  page === p
                    ? 'bg-[var(--color-blue)] text-white'
                    : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
                }`}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
