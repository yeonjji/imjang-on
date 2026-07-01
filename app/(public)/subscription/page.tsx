import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList } from '@/lib/region';
import { slugsToCategories, type SubscriptionStatus } from '@/lib/subscription';
import { SubscriptionFilterPanel } from './_components/subscription-filter-panel';
import { SubscriptionMobileFilterSheet } from './_components/subscription-mobile-filter-sheet';
import { SubscriptionList } from './_components/subscription-list';
import { SourceCaption } from '@/components/ui/source-caption';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';
import { HubGuide } from '../_components/hub-guide';

export const metadata: Metadata = {
  title: '청약·분양 정보',
  description: '아파트·오피스텔·공공임대·사전청약 분양 공고를 한 곳에서. 접수 일정·분양가·주변 시세까지.',
  alternates: { canonical: '/subscription' },
};

export const revalidate = 300;

interface SearchParams {
  category?: string;
  sido?: string;
  status?: string;
  sort?: string;
  page?: string;
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  open: 'OPEN',
  upcoming: 'UPCOMING',
  closed: 'CLOSED',
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [sp, sidoList] = await Promise.all([searchParams, getSidoList()]);

  const categories = slugsToCategories((sp.category ?? '').split(',').filter(Boolean));
  const sido = sp.sido || undefined;
  const status = sp.status ? STATUS_MAP[sp.status] : undefined;
  const sort = (sp.sort === 'notice' ? 'notice' : 'recent') as 'recent' | 'notice';
  const page = Math.max(1, Number(sp.page ?? '1'));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">청약 목록</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">청약·분양 통합</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">청약 목록</h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          아파트·오피스텔·공공/민간임대·사전청약 분양 공고를 접수 일정과 분양가로 한 번에 확인하세요.
        </p>
        <HubGuide category="subscription" />
      </div>

      <Suspense>
        <SubscriptionMobileFilterSheet sidoList={sidoList} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="max-h-[calc(100vh-104px)] overflow-y-auto rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <SubscriptionFilterPanel sidoList={sidoList} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <SubscriptionList
            categories={categories}
            sido={sido}
            status={status}
            sort={sort}
            page={page}
          />
          <SourceCaption ids={['applyhome', 'lh-presub']} />
        </main>
      </div>

      <Faq category="subscription" />
    </div>
  );
}
