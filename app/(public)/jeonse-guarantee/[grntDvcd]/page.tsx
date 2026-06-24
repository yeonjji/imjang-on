import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getJeonseProduct, getProductRegions, getAllGrntDvcds } from '@/lib/jeonse/detail';
import { reqTargetLabel, prodKindLabel, formatWon, bankNames } from '@/lib/jeonse/labels';
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
  };
}

export default async function JeonseGuaranteeDetailPage({ params }: { params: Promise<{ grntDvcd: string }> }) {
  const { grntDvcd } = await params;
  const product = await getJeonseProduct(grntDvcd);
  if (!product) notFound();
  const regions = await getProductRegions(grntDvcd);

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
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--color-muted)]">
                    <th className="py-2">지역</th>
                    <th>최대 임차보증금</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.trgtLwdgCd} className="border-t border-[var(--color-line)]">
                      <td className="py-2">{shortSidoFromRegionCode(r.trgtLwdgCd) ?? r.trgtLwdgCd}</td>
                      <td className="font-semibold text-[var(--color-blue-dark)]">{formatWon(r.maxRentGrntAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                className="block rounded-xl bg-[var(--color-blue)] px-4 py-3 text-center text-sm font-semibold text-white hover:opacity-90"
              >
                HF에서 신청·자세히 보기 ↗
              </a>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
              실제 보증·대출 한도와 금리는 소득·부채 등 개인 상황에 따라 달라집니다. 정확한 내용은 한국주택금융공사(HF)에서
              확인하세요.
            </p>
          </Card>
        </aside>
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
