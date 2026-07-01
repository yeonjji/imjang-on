import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList, getSigunguByCode, sidoFromPrefix } from '@/lib/region';
import { getCategoryDef, toAmenityCategoryView, AMENITY_SLUGS, AMENITY_SOURCE } from '@/lib/amenity/category';
import { getAmenityList, normalizePage } from '@/lib/amenity/list';
import { AmenityFilterPanel } from './_components/amenity-filter-panel';
import { AmenityMobileFilterSheet } from './_components/amenity-mobile-filter-sheet';
import { AmenityCard } from './_components/amenity-card';
import { AmenityPagination } from './_components/amenity-pagination';
import { SiblingTabs } from '../../_components/sibling-tabs';
import { SourceCaption } from '@/components/ui/source-caption';
import { HubSummary } from '../../_components/hub-summary';
import { getAmenityHubSummary } from '@/lib/hub-summary/amenity';
import { HubGuide } from '../../_components/hub-guide';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateStaticParams() {
  return AMENITY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { category } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) return {};
  const region = sp.region ? await getSigunguByCode(sp.region).catch(() => null) : null;
  const scope = region?.fullName ?? sp.sido ?? '전국';
  return {
    title: `${scope} ${def.label}`,
    description: `${scope}에 등록된 ${def.label} 현황을 지역별 분포와 함께 정리했습니다. 주변 아파트 실거래가도 함께 확인하세요.`,
    alternates: {
      canonical: sp.region
        ? `/amenity/${def.slug}?region=${sp.region}`
        : sp.sido
          ? `/amenity/${def.slug}?sido=${encodeURIComponent(sp.sido)}`
          : `/amenity/${def.slug}`,
    },
  };
}

export default async function AmenityListPage({ params, searchParams }: Params) {
  const { category } = await params;
  const sp = await searchParams;
  const def = getCategoryDef(category);
  if (!def) notFound();

  if (def.requiresSidoScope !== false && !sp.sido && !sp.region) {
    // 한글 sido는 location 헤더 인코딩 필수 (Node http 모듈이 non-ASCII 거부)
    redirect(`/amenity/${category}?sido=${encodeURIComponent('서울')}`);
  }

  const effectiveSido = sp.sido ?? (sp.region ? sidoFromPrefix(sp.region.slice(0, 2)) : undefined);

  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';
  const basePath = `/amenity/${def.slug}`;

  const [{ rows, total, totalPages, perPage }, sidoList, region] = await Promise.all([
    getAmenityList(def.slug, {
      sigunguCode: sp.region,
      sido: effectiveSido,
      q: sp.q,
      sub: sp[subKey],
      // 빌드 프리렌더 시 DB 블립에도 배포 통과; ISR이 다음 사이클에 채움
    }, page).catch(() => ({ rows: [], total: 0, page, perPage: 20, totalPages: 0 })),
    getSidoList().catch(() => []),
    sp.region ? getSigunguByCode(sp.region).catch(() => null) : Promise.resolve(null),
  ]);

  const defView = toAmenityCategoryView(def);
  const scopeLabel = region?.fullName ?? (effectiveSido ?? '전국');

  const summary = await getAmenityHubSummary(def.slug, def.label, {
    sigunguCode: sp.region, sido: effectiveSido, q: sp.q, sub: sp[subKey],
  }, scopeLabel).catch(() => null);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/amenity">상권·편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">상권·편의 · {def.breadcrumbLabel}</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          {def.emoji} {scopeLabel} {def.label}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          전체 {total.toLocaleString('ko-KR')}개
        </p>
        <HubSummary data={summary} />
        <HubGuide category={def.slug} />
      </div>

      <SiblingTabs currentHref={`/amenity/${category}`} />

      <Suspense><AmenityMobileFilterSheet def={defView} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <AmenityFilterPanel def={defView} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          {/* 광고 영역 (AdSense 미연동 — 연동 후 활성화)
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
          */}
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
              {rows.map((it) => <AmenityCard key={String(it.id)} item={it} def={def} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><AmenityPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
          <SourceCaption ids={[AMENITY_SOURCE[def.slug]]} />
        </main>
      </div>
    </div>
  );
}
