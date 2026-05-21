import Link from 'next/link';
import { Suspense } from 'react';
import { PropertyType } from '@prisma/client';
import { ListFilterPanel } from './_components/list-filter-panel';
import { MobileFilterSheet } from './_components/mobile-filter-sheet';
import { PropertyList } from './_components/property-list';
import { ListSkeleton } from './_components/list-skeleton';
import { getSidoList } from '@/lib/region';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '부동산 실거래가 검색',
  description: '유형·지역·가격으로 필터링한 부동산 실거래가 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/list' },
};

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

interface SearchParams {
  type?: string;
  deal?: string;
  price_min?: string;
  price_max?: string;
  area?: string;
  sort?: string;
  region?: string;
  sido?: string;
  page?: string;
}

export const revalidate = 60;

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp, sidoList] = await Promise.all([searchParams, getSidoList()]);

  const typeSlug = sp.type ?? 'all';
  const types = TYPE_MAP[typeSlug] ?? TYPE_MAP.all;
  const deal = (sp.deal ?? 'all') as DealFilter;
  const priceMin = sp.price_min ? Number(sp.price_min) : undefined;
  const priceMax = sp.price_max ? Number(sp.price_max) : undefined;
  const areaRange = sp.area as AreaRange | undefined;
  const sort = (sp.sort ?? 'recent') as SortOption;
  const page = Math.max(1, Number(sp.page ?? '1'));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      {/* breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">실거래가 목록</span>
      </nav>

      {/* 상단 헤더 카드 */}
      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">부동산 통합 검색</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">실거래가 목록</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          아파트, 오피스텔, 다세대의 매매·전세·월세 실거래가를 한 번에 확인하세요.
        </p>
      </div>

      {/* 모바일 필터 버튼 */}
      <Suspense>
        <MobileFilterSheet sidoList={sidoList} />
      </Suspense>

      {/* 2컬럼 */}
      <div className="flex gap-6 items-start">
        {/* 사이드바 280px */}
        <aside className="hidden md:block w-[280px] shrink-0 sticky top-[88px]">
          <div className="max-h-[calc(100vh-104px)] overflow-y-auto rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ListFilterPanel sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">
            광고 영역
          </div>
        </aside>

        {/* 메인 영역 */}
        <main className="min-w-0 flex-1">
          <Suspense fallback={<ListSkeleton />}>
            <PropertyList
              types={types}
              deal={deal}
              priceMin={priceMin}
              priceMax={priceMax}
              areaRange={areaRange}
              sort={sort}
              sigunguCode={sp.region}
              sido={sp.sido}
              page={page}
            />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
