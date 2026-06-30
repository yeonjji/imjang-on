import type { Metadata } from 'next';
import Link from 'next/link';
import { getLoanSummaries, collectFacets } from '@/lib/loan/list';
import { SourceCaption } from '@/components/ui/source-caption';
import { LoanExplorer } from './_components/loan-explorer';
import { Faq } from '../_components/faq';

export const metadata: Metadata = {
  title: '서민금융 대출상품 — 주거금융',
  description: '정부·정책·지자체·민간이 제공하는 서민금융 대출상품을 자금용도·대상·지역으로 비교해 보세요.',
  alternates: { canonical: '/finance' },
};

export const revalidate = 86_400;

export default async function FinancePage() {
  const rows = await getLoanSummaries();
  const facets = collectFacets(rows);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">대출상품</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">주거금융</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">
          서민금융 대출상품
        </h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          서민금융진흥원이 모은 정부·정책·지자체·민간 대출상품입니다. 자금용도·대상·지역으로 좁혀 보세요. 운영기간은 상품
          안내 기준이며, 실제 신청 가능 여부·잔여 한도는 취급기관에 확인하세요.
        </p>
      </div>

      <LoanExplorer rows={rows} facets={facets} />

      <div className="mt-6">
        <SourceCaption ids={['kinfa-loan']} />
      </div>

      <Faq category="finance" />
    </div>
  );
}
