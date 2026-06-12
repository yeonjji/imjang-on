import Link from 'next/link';
import { Suspense } from 'react';
import { getPharmacyList, getPharmacyRegions } from '@/lib/pharmacy';
import { PharmacyCard } from './_components/pharmacy-card';
import { PharmacyFilterPanel } from './_components/pharmacy-filter-panel';
import { PharmacyMobileFilterSheet } from './_components/pharmacy-mobile-filter-sheet';
import { SiblingTabs } from '../../_components/sibling-tabs';
import { SourceCaption } from '@/components/ui/source-caption';
import type { Metadata } from 'next';

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: '약국 찾기 — 우리 동네 의료시설',
  description: '전국 시·군·구별 약국 위치·연락처를 찾고, 주변 아파트 실거래가까지 함께 확인하세요.',
  alternates: { canonical: '/medical/pharmacy' },
};

interface Props { searchParams: Promise<{ region?: string; page?: string }>; }

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function PharmacyListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sigunguCode = sp.region;

  const [{ rows, total, totalPages }, regions] = await Promise.all([
    getPharmacyList({ sigunguCode }, page),
    getPharmacyRegions(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">약국</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">의료시설 · 약국</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          약국
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString('ko-KR')}개</p>
      </div>

      <SiblingTabs currentHref="/medical/pharmacy" />

      <Suspense>
        <PharmacyMobileFilterSheet regions={regions} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <PharmacyFilterPanel regions={regions} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 약국
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 약국이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map(p => <PharmacyCard key={String(p.id)} pharmacy={p} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map(p => {
                const params = new URLSearchParams();
                if (sigunguCode) params.set('region', sigunguCode);
                params.set('page', String(p));
                return (
                  <Link
                    key={p}
                    href={`/medical/pharmacy?${params.toString()}`}
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

          <SourceCaption ids={['hira']} />
        </main>
      </div>
    </div>
  );
}
