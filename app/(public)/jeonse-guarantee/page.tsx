import type { Metadata } from 'next';
import Link from 'next/link';
import { getJeonseProducts, getRegionLimits } from '@/lib/jeonse/list';
import { getSidoList, getAllSigungus } from '@/lib/region';
import { SourceCaption } from '@/components/ui/source-caption';
import { JeonseFinder } from './_components/jeonse-finder';

export const metadata: Metadata = {
  title: '맞춤 전세보증 찾기 — 주거금융',
  description:
    '지역과 전세보증금 등 내 조건으로 한국주택금융공사(HF) 전세자금보증 상품을 찾아보세요. 신청 대상·예상 보증료율·한도 상한을 한눈에 비교합니다.',
  alternates: { canonical: '/jeonse-guarantee' },
};

export const revalidate = 86_400;

export default async function JeonseGuaranteePage() {
  const [products, regions, sidoList, sigungus] = await Promise.all([
    getJeonseProducts(),
    getRegionLimits(),
    getSidoList(),
    getAllSigungus(),
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
      </div>

      <JeonseFinder products={products} regions={regions} sidoList={sidoList} sigungus={sigungus} />

      <div className="mt-6">
        <SourceCaption ids={['hf-jeonse-guarantee']} />
      </div>
    </div>
  );
}
