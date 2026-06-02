import Link from 'next/link';
import { Suspense } from 'react';
import { getHospitalList, getHospitalRegions, getHospitalTypeCodes } from '@/lib/hospital';
import { HospitalCard } from './_components/hospital-card';
import { HospitalFilterPanel } from './_components/hospital-filter-panel';
import { HospitalMobileFilterSheet } from './_components/hospital-mobile-filter-sheet';
import { SiblingTabs } from '../../_components/sibling-tabs';
import type { Metadata } from 'next';

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: '병원·의원 찾기 — 우리 동네 의료시설',
  description: '지역별 병원·의원·종합병원 정보를 한눈에.',
  alternates: { canonical: '/medical/hospital' },
};

interface Props { searchParams: Promise<{ region?: string; type?: string; page?: string }>; }

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function HospitalListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sigunguCode = sp.region;
  const typeCode = sp.type;

  const [{ rows, total, totalPages }, regions, typeCodes] = await Promise.all([
    getHospitalList({ sigunguCode, typeCode }, page),
    getHospitalRegions(),
    getHospitalTypeCodes(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">병원·의원</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">의료시설 · 병원·의원</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          병원·의원
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString('ko-KR')}개</p>
      </div>

      <SiblingTabs currentHref="/medical/hospital" />

      <Suspense>
        <HospitalMobileFilterSheet regions={regions} typeCodes={typeCodes} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <HospitalFilterPanel regions={regions} typeCodes={typeCodes} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 병원·의원
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 병원·의원이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map(h => <HospitalCard key={String(h.id)} hospital={h} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map(p => {
                const params = new URLSearchParams();
                if (sigunguCode) params.set('region', sigunguCode);
                if (typeCode) params.set('type', typeCode);
                params.set('page', String(p));
                return (
                  <Link
                    key={p}
                    href={`/medical/hospital?${params.toString()}`}
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
        </main>
      </div>
    </div>
  );
}
