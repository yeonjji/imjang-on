import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList } from '@/lib/region';
import { getChildcareList, type ChildcareTypeSlug } from '@/lib/childcare';
import { ChildcareFilterPanel } from './_components/childcare-filter-panel';
import { ChildcareMobileFilterSheet } from './_components/childcare-mobile-filter-sheet';
import { ChildcareCard } from './_components/childcare-card';
import { ChildcarePagination } from './_components/childcare-pagination';
import { SiblingTabs } from '../_components/sibling-tabs';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';
import { getChildcareHubSummary } from '@/lib/hub-summary/childcare';
import { HubIntro } from '../_components/hub-intro';

export const metadata: Metadata = {
  title: '어린이집찾기 — 전국 국공립·민간·가정',
  description: '지역·유형으로 어린이집을 찾고, 주변 아파트 실거래가까지 확인하세요.',
  alternates: { canonical: '/childcare' },
};

export const revalidate = 21_600;

interface Props { searchParams: Promise<Record<string, string>>; }

export default async function ChildcareListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sidoList = await getSidoList().catch(() => []);
  const basePath = '/childcare';
  const page = Math.max(1, Number(sp.page ?? '1'));
  const sidoFull = sidoList.find(s => s.sido === sp.sido)?.fullName;
  const filter = {
    sido: sidoFull,
    sigunguCode: sp.region,
    type: (sp.type ?? 'all') as ChildcareTypeSlug,
    q: sp.q,
    includeInactive: sp.inactive,
  };
  const [{ rows, total, totalPages, perPage }, summary] = await Promise.all([
    getChildcareList(filter, page),
    getChildcareHubSummary(sp.region).catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">어린이집찾기</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의 · 어린이집찾기</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">어린이집찾기</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">지역·운영유형으로 좁혀보세요. 어린이집을 누르면 정원·연령별 현황과 주변 아파트 실거래가까지 확인할 수 있어요.</p>
        <HubIntro summary={summary} category="childcare" />
        <Link
          href="/childcare/regions"
          className="mt-4 inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-blue)] transition hover:border-[var(--color-sky)]"
        >
          📍 지역별 어린이집 찾기 →
        </Link>
      </div>

      <SiblingTabs currentHref="/childcare" />

      <Suspense><ChildcareMobileFilterSheet basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ChildcareFilterPanel basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          {/* 광고 영역 (AdSense 미연동 — 연동 후 활성화)
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
          */}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 어린이집</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 어린이집이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((c) => <ChildcareCard key={String(c.id)} item={c} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><ChildcarePagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>

      <Faq category="childcare" />
    </div>
  );
}
