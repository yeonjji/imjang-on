import Link from 'next/link';
import { Suspense } from 'react';
import { getHospitalList, getHospitalRegions, getHospitalTypeCodes } from '@/lib/hospital';
import { HospitalCard } from './_components/hospital-card';
import { HospitalFilterPanel } from './_components/hospital-filter-panel';
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

      <h1 className="mb-2 text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">병원·의원</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString()}개 병원·의원 정보</p>

      <div className="mb-6">
        <Suspense>
          <HospitalFilterPanel
            regions={regions}
            typeCodes={typeCodes}
            currentSigunguCode={sigunguCode}
            currentTypeCode={typeCode}
          />
        </Suspense>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-muted)]">검색 결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
