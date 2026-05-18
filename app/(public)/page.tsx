import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { PropertyCard } from './_components/property-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 단지 단위로 한눈에.',
};

export const revalidate = 3600;

export default async function HomePage() {
  const popular = await prisma.property.findMany({
    where: { propertyType: PropertyType.APARTMENT, txCount12m: { gt: 0 } },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: 9,
  });

  return (
    <>
      <section className="mx-auto max-w-[1180px] px-6 py-16">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-blue-dark)]">
          공공데이터 기반 · 매일 갱신
        </span>
        <h1 className="mt-5 text-4xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-5xl">
          실거래가, 한 번에 보세요
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
          아파트·오피스텔·연립다세대 매매와 전월세를 단지 단위로 정리해 보여드립니다.
        </p>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 pb-16">
        <h2 className="mb-6 text-2xl font-bold text-[var(--color-blue-dark)]">인기 아파트 단지</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {popular.map((p) => (
            <PropertyCard key={String(p.id)} property={p} />
          ))}
        </div>
      </section>
    </>
  );
}
