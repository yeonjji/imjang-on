import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLoanProduct, getAllLoanSeqs, LOAN_SECTIONS, isDisplayable } from '@/lib/loan/detail';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import { LoanHero } from './_components/loan-hero';
import { LoanSidebar } from './_components/loan-sidebar';

export const revalidate = 86_400;

export async function generateStaticParams() {
  // 빌드 DB에 LoanProduct가 아직 없거나(마이그레이션 미적용) DB 불가 시
  // 빌드를 깨뜨리지 않고 on-demand 렌더로 폴백한다.
  try {
    const seqs = await getAllLoanSeqs();
    return seqs.map((seq) => ({ seq: String(seq) }));
  } catch {
    return [];
  }
}

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
            const visible = section.fields.filter((f) => isDisplayable(raw[f.key]));
            if (visible.length === 0) return null;
            return (
              <Card key={section.title}>
                <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{section.title}</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
                  {visible.map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-sm font-semibold text-[var(--color-muted)]">{f.label}</dt>
                      <dd className="mb-2 text-sm text-[var(--color-text)] sm:mb-0">{String(raw[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}

          <SourceCaption ids={['kinfa-loan']} />
        </main>

        <aside className="min-w-0">
          <LoanSidebar product={product} rltsite={rltsite} />
        </aside>
      </div>
    </div>
  );
}
