import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList } from '@/lib/region';
import { getSchoolList, type SchoolKindSlug, type FoundSlug, type CoeduSlug } from '@/lib/school';
import { SchoolFilterPanel } from './_components/school-filter-panel';
import { SchoolMobileFilterSheet } from './_components/school-mobile-filter-sheet';
import { SchoolCard } from './_components/school-card';
import { SchoolPagination } from './_components/school-pagination';
import { SiblingTabs } from '../_components/sibling-tabs';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';
import { getSchoolHubSummary } from '@/lib/hub-summary/school';
import { HubIntro } from '../_components/hub-intro';

export const metadata: Metadata = {
  title: '학교찾기 — 전국 초·중·고·특수학교',
  description: '지역·학교급·설립유형으로 학교를 찾고, 학교 주변 아파트 실거래가까지 확인하세요.',
  alternates: { canonical: '/school' },
};

export const revalidate = 21_600;

interface Props { searchParams: Promise<Record<string, string>>; }

export default async function SchoolListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sidoList = await getSidoList().catch(() => []);
  const basePath = '/school';
  const page = Math.max(1, Number(sp.page ?? '1'));
  const sidoFull = sidoList.find(s => s.sido === sp.sido)?.fullName;
  const filter = {
    sido: sidoFull,
    sigunguCode: sp.region,
    kind: (sp.kind ?? 'all') as SchoolKindSlug,
    found: (sp.found ?? 'all') as FoundSlug,
    coedu: (sp.coedu ?? 'all') as CoeduSlug,
    q: sp.q,
  };
  const [{ rows, total, totalPages, perPage }, summary] = await Promise.all([
    getSchoolList(filter, page),
    getSchoolHubSummary(sp.region).catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">학교찾기</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의 · 학교찾기</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">학교찾기</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">지역·학교급으로 좁혀보세요. 학교를 누르면 주변 아파트 실거래가까지 확인할 수 있어요.</p>
        <HubIntro summary={summary} category="school" />
        <Link
          href="/school/regions"
          className="mt-4 inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-blue)] transition hover:border-[var(--color-sky)]"
        >
          📍 지역별 학교 찾기 →
        </Link>
      </div>

      <SiblingTabs currentHref="/school" />

      <Suspense><SchoolMobileFilterSheet basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <SchoolFilterPanel basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          {/* 광고 영역 (AdSense 미연동 — 연동 후 활성화)
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
          */}
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

      <Faq category="school" />
    </div>
  );
}
