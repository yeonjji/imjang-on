import Link from 'next/link';
import { listPublishedGuides } from '@/lib/guide/queries';
import { GUIDE_CATEGORIES, guideCategoryLabel } from '@/lib/guide/labels';
import type { GuideCategory } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 3_600;

export const metadata: Metadata = {
  title: '생활·부동산 가이드',
  description: '부동산 실거래가·청약·금융·의료·보육·학교·생활 정보를 쉽게 풀어 설명하는 상록 가이드.',
  alternates: { canonical: '/guide' },
};

interface Props { searchParams: Promise<{ category?: string; page?: string }>; }

function isCategory(v: string | undefined): v is GuideCategory {
  return !!v && GUIDE_CATEGORIES.some((c) => c.value === v);
}

function buildHref(opts: { category?: GuideCategory; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.category) params.set('category', opts.category);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/guide?${qs}` : '/guide';
}

function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
    active ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
  }`;
}

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function GuideListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsedPage = Number(sp.page ?? 1);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const category = isCategory(sp.category) ? sp.category : undefined;

  const { rows, totalPages } = await listPublishedGuides({ page, category });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">가이드</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">생활·부동산 가이드</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">공공데이터를 토대로 개념·절차를 쉽게 풀어 설명합니다.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={buildHref({})} className={chipClass(!category)}>전체</Link>
        {GUIDE_CATEGORIES.map((c) => (
          <Link key={c.value} href={buildHref({ category: c.value })} className={chipClass(category === c.value)}>
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          아직 게시된 가이드가 없습니다.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((g) => (
            <li key={g.slug} className="rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]">
              <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                {guideCategoryLabel(g.category)}
              </span>
              <Link href={`/guide/${g.slug}`} className="mt-2 block text-lg font-bold text-[var(--color-blue-dark)] hover:underline">
                {g.title}
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{g.summary}</p>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {pageNums(page, totalPages).map((p) => (
            <Link
              key={p}
              href={buildHref({ category, page: p })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                page === p ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
