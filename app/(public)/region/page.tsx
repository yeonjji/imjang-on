import { getSidoList } from '@/lib/region';
import { RegionCard } from '../_components/region-card';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';

export const metadata: Metadata = {
  title: '시도별 부동산 실거래가',
  description: '서울·경기·인천·부산 등 전국 시도별 부동산 실거래가를 한눈에.',
  alternates: { canonical: '/region' },
};

export const revalidate = 86_400;

export default async function RegionHubPage() {
  // 빌드 시 DB 일시 장애에도 배포 통과시키고 ISR이 다음 사이클에 채운다
  const sidos = await getSidoList().catch((err) => {
    console.error('RegionHubPage: sido query failed', err);
    return [] as Awaited<ReturnType<typeof getSidoList>>;
  });
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

      <Faq category="region" />
    </section>
  );
}
