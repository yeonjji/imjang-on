import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLoanProduct, LOAN_SECTIONS, isDisplayable, isPlausibleValue, formatLoanValue } from '@/lib/loan/detail';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { formatAsOf } from '@/lib/format';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import { LoanHero } from './_components/loan-hero';
import { LoanSidebar } from './_components/loan-sidebar';
import { getLoanSummaries } from '@/lib/loan/list';
import { recommendLoans, MAX_RELATED } from '@/lib/loan/related';
import { RelatedLoans } from './_components/related-loans';
import { getLoanDiscovery } from '@/lib/loan/discovery';
import { LoanDiscoverySection } from './_components/loan-discovery-section';
import { BoardBriefingSection } from '../../_components/board-briefing-section';
import { RelatedGuides } from '../../_components/related-guides';

export const revalidate = 86_400;

// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
// 빌드타임에 각 상세를 프리렌더하지 않아 빌드가 Supabase에 접근하지 않는다 — 빌드 중 DB 블립으로
// 배포가 깨지는 것을 방지(subscription/board 등과 동일 패턴).
export function generateStaticParams() { return []; }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seq: string }>;
}): Promise<Metadata> {
  const { seq } = await params;
  const product = await getLoanProduct(Number(seq));
  if (!product) return {};
  const provider = product.ofrinstnm ? `${product.ofrinstnm} ` : '';
  const limit = product.lnlmt ? ` 한도 ${product.lnlmt.toLocaleString('ko-KR')}만원` : '';
  const target = product.targetTags.length ? `, ${product.targetTags.slice(0, 2).join('·')} 대상` : '';
  return {
    title: `${product.finprdnm} 한도·금리 — 주거금융`,
    description: `${provider}${product.finprdnm}${limit}${target}. 금리·자격요건·신청방법을 한눈에 확인하세요.`,
    alternates: { canonical: `/finance/${seq}` },
  };
}

export default async function LoanDetailPage({ params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const product = await getLoanProduct(Number(seq));
  if (!product) notFound();

  const raw = product.rawJson as Record<string, unknown>;
  const rltsite = isDisplayable(raw.rltsite) ? String(raw.rltsite) : null;
  const related = recommendLoans(product, await getLoanSummaries(), MAX_RELATED);
  const discovery = await getLoanDiscovery(product);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '주거금융', url: `${SITE_URL}/finance` },
            { name: product.finprdnm, url: `${SITE_URL}/finance/${seq}` },
          ]),
        ]}
      />
      <LoanHero product={product} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          {LOAN_SECTIONS.map((section) => {
            const visible = section.fields.filter(
              (f) => isDisplayable(raw[f.key]) && isPlausibleValue(raw[f.key], f.unit),
            );
            if (visible.length === 0) return null;

            // '한눈에'는 핵심 수치라 색 틴트 메트릭 박스 그리드로(텍스트 단조로움 완화).
            if (section.title === '한눈에') {
              return (
                <Card key={section.title}>
                  <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{section.title}</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {visible.map((f) => (
                      <div key={f.key} className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
                        <span className="mb-1 block text-xs text-[var(--color-muted)]">{f.label}</span>
                        <strong className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">
                          {formatLoanValue(raw[f.key], f.unit)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            }

            return (
              <Card key={section.title}>
                <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{section.title}</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
                  {visible.map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-sm font-semibold text-[var(--color-muted)]">{f.label}</dt>
                      <dd className="mb-2 text-sm text-[var(--color-text)] sm:mb-0">{formatLoanValue(raw[f.key], f.unit)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}

          <div>
            <SourceCaption ids={['kinfa-loan']} />
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted)]">
              데이터 기준일 {formatAsOf(product.updatedAt)} · 대출한도·금리·상환조건은 상품 안내 기준이며 변경될 수 있어{' '}
              <strong className="font-semibold">실제와 다를 수 있습니다</strong>. 실제 한도·금리는 소득·부채 등 개인
              상황에 따라 달라지니, 정확한 내용은 취급기관·서민금융진흥원에서 확인하세요.
            </p>
          </div>

          <RelatedLoans items={related} />
          <LoanDiscoverySection discovery={discovery} />
          <BoardBriefingSection />
          <RelatedGuides pageKey="finance" />
        </main>

        <aside className="min-w-0">
          <LoanSidebar product={product} rltsite={rltsite} />
        </aside>
      </div>
    </div>
  );
}
