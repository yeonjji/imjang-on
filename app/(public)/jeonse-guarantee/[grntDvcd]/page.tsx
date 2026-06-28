import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getJeonseProduct, getProductRegions, getAllGrntDvcds } from '@/lib/jeonse/detail';
import { reqTargetLabel, prodKindLabel, formatWon, bankNames, formatAsOf } from '@/lib/jeonse/labels';
import { getTransactionTeaser } from '@/lib/board/detail-teasers';
import { getWeeklySubscriptions, flattenWeeklyBoard } from '@/lib/subscription';
import { getLoanSummaries, type LoanSummary } from '@/lib/loan/list';
import { relatedLoansForJeonse } from '@/lib/jeonse/related-loans';
import { JeonseDiscoverySection } from './_components/jeonse-discovery-section';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { shortSidoFromRegionCode } from '@/lib/region';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86_400;

export async function generateStaticParams() {
  const codes = await getAllGrntDvcds();
  return codes.map((grntDvcd) => ({ grntDvcd }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ grntDvcd: string }>;
}): Promise<Metadata> {
  const { grntDvcd } = await params;
  const p = await getJeonseProduct(grntDvcd);
  if (!p) return {};
  return {
    title: `${p.rcmdProdNm} — 전세자금보증`,
    description: `${p.rcmdProdNm}의 신청 대상·예상 보증료율·최대 한도·취급은행을 한눈에. 한국주택금융공사(HF) 전세자금보증 상품 안내.`,
    alternates: { canonical: `/jeonse-guarantee/${grntDvcd}` },
    // 상품 라벨-값 템플릿(고유 서술 0) — 색인 제외, 링크는 follow 유지
    robots: { index: false, follow: true },
  };
}

export default async function JeonseGuaranteeDetailPage({ params }: { params: Promise<{ grntDvcd: string }> }) {
  const { grntDvcd } = await params;
  const product = await getJeonseProduct(grntDvcd);
  if (!product) notFound();
  const regions = await getProductRegions(grntDvcd);

  const [briefing, weeklyBoard, allLoans] = await Promise.all([
    getTransactionTeaser(),
    getWeeklySubscriptions().catch(() => null),
    getLoanSummaries().catch(() => [] as LoanSummary[]),
  ]);
  const weeklySubscriptions = weeklyBoard ? flattenWeeklyBoard(weeklyBoard, 4) : [];
  const relatedLoans = relatedLoansForJeonse(product, allLoans, 3);

  const kind = prodKindLabel(product.rcmdGrntProdDvcd);
  const target = reqTargetLabel(product.grntReqTrgtDvcd);
  const targets = product.reqTrgtCont
    ? product.reqTrgtCont.split('|').map((s) => s.trim()).filter(Boolean)
    : [];
  const banks = bankNames(product.trtBankCont);
  const raw = product.rawJson as Record<string, unknown>;
  const qscNm = typeof raw.qscNm === 'string' && raw.qscNm.trim() ? raw.qscNm.trim() : null;
  const qscTlno = typeof raw.qscTlno === 'string' && raw.qscTlno.trim() ? raw.qscTlno.trim() : null;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '맞춤 전세보증 찾기', url: `${SITE_URL}/jeonse-guarantee` },
            { name: product.rcmdProdNm, url: `${SITE_URL}/jeonse-guarantee/${grntDvcd}` },
          ]),
        ]}
      />

      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <Link href="/jeonse-guarantee">맞춤 전세보증 찾기</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{product.rcmdProdNm}</span>
      </nav>

      <div className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {kind && <Badge>{kind}</Badge>}
          {target && target !== '전체' && <Badge>{target}</Badge>}
        </div>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{product.rcmdProdNm}</h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">한눈에</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label="상품 최대한도"
                value={product.maxLoanLmtAmt != null ? formatWon(product.maxLoanLmtAmt) : '—'}
              />
              <Metric
                label="임차보증금 대비 한도비율"
                value={product.rentGrntMaxLoanLmtRate != null ? `${product.rentGrntMaxLoanLmtRate}%` : '—'}
              />
              <Metric label="예상 보증료율" value={product.exptGrfeRateCont ?? '—'} />
            </div>
          </Card>

          {targets.length > 0 && (
            <Card>
              <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">신청 대상</h2>
              <ul className="flex flex-col gap-2">
                {targets.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--color-text)]">
                    <span aria-hidden className="text-[var(--color-blue)]">•</span>
                    <span className="break-keep">{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(product.grntPrmeCont || product.intSprtCont) && (
            <Card>
              <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">우대 · 이자지원</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[120px_1fr]">
                {product.grntPrmeCont && (
                  <div className="contents">
                    <dt className="text-sm font-semibold text-[var(--color-muted)]">우대 내용</dt>
                    <dd className="mb-2 text-sm text-[var(--color-text)] sm:mb-0">{product.grntPrmeCont}</dd>
                  </div>
                )}
                {product.intSprtCont && (
                  <div className="contents">
                    <dt className="text-sm font-semibold text-[var(--color-muted)]">이자 지원</dt>
                    <dd className="text-sm text-[var(--color-text)]">{product.intSprtCont}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {regions.length > 0 && (
            <Card>
              <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">지역별 최대 임차보증금</h2>
              <ul className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
                {regions.map((r) => (
                  <li
                    key={r.trgtLwdgCd}
                    className="flex items-center justify-between border-t border-[var(--color-line)] py-2 text-sm"
                  >
                    <span className="text-[var(--color-text)]">
                      {shortSidoFromRegionCode(r.trgtLwdgCd) ?? r.trgtLwdgCd}
                    </span>
                    <span className="font-semibold text-[var(--color-blue-dark)]">{formatWon(r.maxRentGrntAmt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <SourceCaption ids={['hf-jeonse-guarantee']} />
        </main>

        <aside className="min-w-0">
          <Card>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">취급 · 문의</h2>
            {banks.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-sm font-semibold text-[var(--color-muted)]">취급 은행</p>
                <div className="flex flex-wrap gap-1.5">
                  {banks.map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-[var(--color-soft)] px-2.5 py-1 text-xs text-[var(--color-text)]"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(qscNm || qscTlno) && (
              <p className="mb-4 text-sm text-[var(--color-text)]">
                <span className="font-semibold text-[var(--color-muted)]">문의처 </span>
                {[qscNm, qscTlno].filter(Boolean).join(' · ')}
              </p>
            )}
            {product.guidUrl && (
              <a
                href={product.guidUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-full bg-[var(--color-blue)] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-[var(--color-blue-dark)]"
              >
                HF에서 신청·자세히 보기 ↗
              </a>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
              데이터 기준일 {formatAsOf(product.updatedAt)} · 상품 운영 여부와 세부 조건은 변경될 수 있어{' '}
              <strong className="font-semibold">실제와 다를 수 있습니다</strong>. 실제 보증·대출 한도와 금리는 소득·부채 등
              개인 상황에 따라 달라지니, 정확한 내용은 한국주택금융공사(HF)에서 확인하세요.
            </p>
          </Card>
        </aside>
      </div>

      <div className="lg:w-[calc(100%_-_352px)]">
        <JeonseDiscoverySection
          briefing={briefing}
          weeklySubscriptions={weeklySubscriptions}
          relatedLoans={relatedLoans}
        />

        <BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--color-sky-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-blue)]">
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[var(--color-soft)] px-4 py-3">
      <span className="mb-1 block text-xs text-[var(--color-muted)]">{label}</span>
      <strong className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">{value}</strong>
    </div>
  );
}
