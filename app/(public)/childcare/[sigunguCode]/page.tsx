import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { getSigunguByCode } from '@/lib/region';
import { getChildcareList, getChildcareTypeCounts, type ChildcareTypeSlug } from '@/lib/childcare';

async function resolveRegionDisplay(sigunguCode: string) {
  const region = await getSigunguByCode(sigunguCode).catch(() => null);
  if (region) return { fullName: region.fullName, sigungu: region.sigungu, sigunguCode };
  // Region 테이블에 매핑 없으면 Childcare row의 sido/sigungu로 fallback
  const cc = await prisma.childcare.findFirst({
    where: { sigunguCode },
    select: { sido: true, sigungu: true },
  });
  if (!cc) return null;
  const fullName = [cc.sido, cc.sigungu].filter(Boolean).join(' ') || sigunguCode;
  return { fullName, sigungu: cc.sigungu ?? '', sigunguCode };
}
import { ChildcareFilterPanel } from '../_components/childcare-filter-panel';
import { ChildcareMobileFilterSheet } from '../_components/childcare-mobile-filter-sheet';
import { ChildcareCard } from '../_components/childcare-card';
import { ChildcarePagination } from '../_components/childcare-pagination';
import { SourceCaption } from '@/components/ui/source-caption';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode } = await params;
  const r = await resolveRegionDisplay(sigunguCode);
  if (!r) return {};
  return {
    title: `${r.fullName} 어린이집 — 국공립·민간·가정`,
    description: `${r.fullName}의 어린이집 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/childcare/${sigunguCode}` },
  };
}

export default async function ChildcareSigunguListPage({ params, searchParams }: Params) {
  const { sigunguCode } = await params;
  const sp = await searchParams;
  const region = await resolveRegionDisplay(sigunguCode);
  if (!region) notFound();

  const basePath = `/childcare/${sigunguCode}`;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const filter = {
    sigunguCode,
    type: (sp.type ?? 'all') as ChildcareTypeSlug,
    q: sp.q,
    includeInactive: sp.inactive,
  };
  const [{ rows, total, totalPages, perPage }, typeCounts] = await Promise.all([
    getChildcareList(filter, page),
    getChildcareTypeCounts(sigunguCode),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">어린이집찾기 · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} 어린이집</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {typeCounts.total.toLocaleString('ko-KR')}개 · <Link href="/childcare" className="font-semibold text-[var(--color-blue)]">전국에서 검색 →</Link></p>
      </div>

      <Suspense><ChildcareMobileFilterSheet basePath={basePath} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ChildcareFilterPanel basePath={basePath} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
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
          <SourceCaption ids={['childcare']} />
        </main>
      </div>
    </div>
  );
}
