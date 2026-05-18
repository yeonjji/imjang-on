import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { PropertyCard } from '../_components/property-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '부동산 실거래가 검색',
  description: '유형·지역·가격으로 필터링한 부동산 실거래가 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/list' },
};

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

interface SearchParams {
  type?: string;
  region?: string;
  page?: string;
}

export const revalidate = 60;

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const types = TYPE_MAP[sp.type ?? 'all'] ?? TYPE_MAP.all;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const perPage = 30;

  const where: { propertyType: { in: PropertyType[] }; txCount12m: { gt: number }; sigunguCode?: string } = {
    propertyType: { in: types },
    txCount12m: { gt: 0 },
  };
  if (sp.region) where.sigunguCode = sp.region;

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { region: true },
      orderBy: { lastTxAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.property.count({ where }),
  ]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">부동산 실거래가 검색</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {total.toLocaleString('ko-KR')}건 발견
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {rows.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
