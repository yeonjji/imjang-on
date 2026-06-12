import type { Metadata } from 'next';
import { getLoanSummaries, collectFacets } from '@/lib/loan/list';
import { SourceCaption } from '@/components/ui/source-caption';
import { LoanExplorer } from './_components/loan-explorer';

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
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">주거금융</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        서민금융 대출상품
      </h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        서민금융진흥원이 모은 정부·정책·지자체·민간 대출상품입니다. 자금용도·대상·지역으로 좁혀 보세요.
      </p>

      <LoanExplorer rows={rows} facets={facets} />

      <SourceCaption ids={['kinfa-loan']} />
    </section>
  );
}
