import type { Metadata } from 'next';
import Link from 'next/link';
import { getJeonseProducts, getRegionLimits, getJeonseDataAsOf } from '@/lib/jeonse/list';
import { formatAsOf } from '@/lib/jeonse/labels';
import { getSidoList, getSigunguList } from '@/lib/region';
import { SourceCaption } from '@/components/ui/source-caption';
import { JeonseFinder } from './_components/jeonse-finder';
import { FinanceTabs } from '../_components/finance-tabs';
import { Faq } from '../_components/faq';

export const metadata: Metadata = {
  title: '맞춤 전세보증 찾기 — 주거금융',
  description:
    '지역과 전세보증금 등 내 조건으로 한국주택금융공사(HF) 전세자금보증 상품을 찾아보세요. 신청 대상·예상 보증료율·한도 상한을 한눈에 비교합니다.',
  alternates: { canonical: '/jeonse-guarantee' },
};

export const revalidate = 86_400;

export default async function JeonseGuaranteePage() {
  const [products, regions, sidoList, sigungus, dataAsOf] = await Promise.all([
    getJeonseProducts(),
    getRegionLimits(),
    getSidoList(),
    getSigunguList(),
    getJeonseDataAsOf(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link>
        <span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">맞춤 전세보증 찾기</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">주거금융</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">맞춤 전세보증 찾기</h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          지역과 전세보증금 등 내 조건을 입력하면, 한국주택금융공사(HF) 전세자금보증 상품 중 신청 가능한 상품을 찾아드립니다.
          한도는 상품 기준 상한이며, 정확한 금액은 소득·부채 등에 따라 달라집니다.
        </p>
        <p className="mt-3 break-keep text-[12px] leading-relaxed text-[var(--color-muted)]">
          {dataAsOf && <>데이터 기준일 {formatAsOf(dataAsOf)} · </>}상품 운영 여부와 세부 조건은 변경될 수 있어{' '}
          <strong className="font-semibold">실제와 다를 수 있습니다</strong>. 신청 전 한국주택금융공사(HF)에서 확인하세요.
        </p>
      </div>

      <FinanceTabs currentHref="/jeonse-guarantee" />

      <JeonseFinder products={products} regions={regions} sidoList={sidoList} sigungus={sigungus} />

      <div className="mt-6">
        <SourceCaption ids={['hf-jeonse-guarantee']} />
      </div>

      <Faq category="jeonse-guarantee" />
    </div>
  );
}
