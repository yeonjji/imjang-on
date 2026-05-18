import { getSidoList } from '@/lib/region';
import { RegionCard } from '../_components/region-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '시도별 부동산 실거래가',
  description: '서울·경기·인천·부산 등 전국 시도별 부동산 실거래가를 한눈에.',
  alternates: { canonical: '/region' },
};

export const revalidate = 86_400;

export default async function RegionHubPage() {
  const sidos = await getSidoList();
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="mb-8 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        시도별 부동산 실거래가
      </h1>
      <div className="grid gap-3 md:grid-cols-5">
        {sidos.map((s) => (
          <RegionCard key={s.code} code={s.code} name={s.sido} />
        ))}
      </div>
    </section>
  );
}
