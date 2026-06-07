import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getSidoList, getSigunguByCode, sidoFromPrefix } from '@/lib/region';
import { getUrbanCategoryDef, toUrbanCategoryView, URBAN_SLUGS, URBAN_SOURCE } from '@/lib/urban/category';
import { getUrbanList, normalizePage } from '@/lib/urban/list';
import { UrbanFilterPanel } from './_components/urban-filter-panel';
import { UrbanMobileFilterSheet } from './_components/urban-mobile-filter-sheet';
import { UrbanCard } from './_components/urban-card';
import { UrbanPagination } from './_components/urban-pagination';
import { SiblingTabs } from '../../_components/sibling-tabs';
import { SourceCaption } from '@/components/ui/source-caption';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateStaticParams() {
  return URBAN_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { category } = await params;
  const sp = await searchParams;
  const def = getUrbanCategoryDef(category);
  if (!def) return {};
  const region = sp.region ? await getSigunguByCode(sp.region).catch(() => null) : null;
  const scope = region?.fullName ?? sp.sido ?? '전국';
  return {
    title: `${scope} ${def.label}`,
    description: `${scope}의 ${def.label} 목록과 위치, 주변 아파트 실거래가.`,
    alternates: {
      canonical: sp.region
        ? `/urban/${def.slug}?region=${sp.region}`
        : sp.sido
          ? `/urban/${def.slug}?sido=${encodeURIComponent(sp.sido)}`
          : `/urban/${def.slug}`,
    },
  };
}

export default async function UrbanListPage({ params, searchParams }: Params) {
  const { category } = await params;
  const sp = await searchParams;
  const def = getUrbanCategoryDef(category);
  if (!def) notFound();

  if (def.requiresSidoScope !== false && !sp.sido && !sp.region) {
    redirect(`/urban/${category}?sido=${encodeURIComponent('서울')}`);
  }

  const effectiveSido = sp.sido ?? (sp.region ? sidoFromPrefix(sp.region.slice(0, 2)) : undefined);

  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';
  const basePath = `/urban/${def.slug}`;

  const [{ rows, total, totalPages, perPage }, sidoList, region] = await Promise.all([
    getUrbanList(def.slug, {
      sigunguCode: sp.region,
      sido: effectiveSido,
      q: sp.q,
      sub: sp[subKey],
      charge: sp.charge,
      type: sp.type,
      pwd: sp.pwd,
      open24: sp.open24,
    }, page),
    getSidoList().catch(() => []),
    sp.region ? getSigunguByCode(sp.region).catch(() => null) : Promise.resolve(null),
  ]);

  const defView = toUrbanCategoryView(def);
  const scopeLabel = region?.fullName ?? (effectiveSido ?? '전국');

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/urban">도시인프라</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">도시인프라 · {def.breadcrumbLabel}</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          {def.emoji} {scopeLabel} {def.label}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {total.toLocaleString('ko-KR')}개</p>
      </div>

      <SiblingTabs currentHref={`/urban/${category}`} />

      <Suspense><UrbanMobileFilterSheet def={defView} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <UrbanFilterPanel def={defView} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 {def.label}
            </p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 {def.label}이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((it) => <UrbanCard key={String(it.id)} item={it} def={def} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><UrbanPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
          <SourceCaption ids={[URBAN_SOURCE[def.slug]]} />
        </main>
      </div>
    </div>
  );
}
