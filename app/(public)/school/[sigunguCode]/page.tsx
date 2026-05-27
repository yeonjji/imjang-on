import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSigunguByCode } from '@/lib/region';
import { getSchoolList, getSchoolKindCounts, type SchoolKindSlug, type FoundSlug, type CoeduSlug } from '@/lib/school';
import { SchoolFilterPanel } from '../_components/school-filter-panel';
import { SchoolMobileFilterSheet } from '../_components/school-mobile-filter-sheet';
import { SchoolCard } from '../_components/school-card';
import { SchoolPagination } from '../_components/school-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode } = await params;
  const r = await getSigunguByCode(sigunguCode).catch(() => null);
  if (!r) return {};
  return {
    title: `${r.fullName} 학교 — 초·중·고·특수`,
    description: `${r.fullName}의 학교 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/school/${sigunguCode}` },
  };
}

export default async function SchoolSigunguListPage({ params, searchParams }: Params) {
  const { sigunguCode } = await params;
  const sp = await searchParams;
  const region = await getSigunguByCode(sigunguCode);
  if (!region || !region.sigunguCode) notFound();

  const basePath = `/school/${sigunguCode}`;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const filter = {
    sigunguCode,
    kind: (sp.kind ?? 'all') as SchoolKindSlug,
    found: (sp.found ?? 'all') as FoundSlug,
    coedu: (sp.coedu ?? 'all') as CoeduSlug,
    q: sp.q,
  };

  const [{ rows, total, totalPages, perPage }, kindCounts] = await Promise.all([
    getSchoolList(filter, page),
    getSchoolKindCounts(sigunguCode),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">학교찾기 · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} 학교</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {kindCounts.total.toLocaleString('ko-KR')}개 · <Link href="/school" className="font-semibold text-[var(--color-blue)]">전국에서 검색 →</Link></p>
      </div>

      <Suspense><SchoolMobileFilterSheet basePath={basePath} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <SchoolFilterPanel basePath={basePath} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 학교</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 학교가 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((s) => <SchoolCard key={String(s.id)} school={s} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><SchoolPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
