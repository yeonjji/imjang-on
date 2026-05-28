import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSigunguByCode, getSidoList } from '@/lib/region';
import { getCategoryDef } from '@/lib/amenity/category';
import { getAmenityList, normalizePage } from '@/lib/amenity/list';
import { AmenityFilterPanel } from '../_components/amenity-filter-panel';
import { AmenityMobileFilterSheet } from '../_components/amenity-mobile-filter-sheet';
import { AmenityCard } from '../_components/amenity-card';
import { AmenityPagination } from '../_components/amenity-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ category: string; sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sigunguCode } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  const r = await getSigunguByCode(sigunguCode).catch(() => null);
  if (!r) return {};
  return {
    title: `${r.fullName} ${def.label}`,
    description: `${r.fullName}의 ${def.label} 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/amenity/${def.slug}/${sigunguCode}` },
  };
}

export default async function AmenitySigunguListPage({ params, searchParams }: Params) {
  const { category, sigunguCode } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) notFound();
  const region = await getSigunguByCode(sigunguCode);
  if (!region || !region.sigunguCode) notFound();

  const basePath = `/amenity/${def.slug}/${sigunguCode}`;
  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';

  const [{ rows, total, totalPages, perPage }, sidoList] = await Promise.all([
    getAmenityList(def.slug, {
      sigunguCode,
      q: sp.q,
      sub: sp[subKey],
    }, page),
    getSidoList().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href={`/amenity/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">{def.breadcrumbLabel} · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} {def.label}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {total.toLocaleString('ko-KR')}개 · <Link href={`/amenity/${def.slug}`} className="font-semibold text-[var(--color-blue)]">전국에서 검색 →</Link></p>
      </div>

      <Suspense><AmenityMobileFilterSheet def={def} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <AmenityFilterPanel def={def} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 {def.label}</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 {def.label}이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((it) => <AmenityCard key={String(it.id)} item={it} def={def} basePath={basePath} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><AmenityPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
