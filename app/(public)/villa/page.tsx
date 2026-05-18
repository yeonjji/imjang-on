import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 연립·다세대 실거래가',
  description: '공공데이터 기반 전국 연립주택·다세대주택 매매·전세·월세 실거래가.',
  alternates: { canonical: '/villa' },
};

export const revalidate = 3600;

export default async function VillaHubPage() {
  const popular = await getTopPropertiesByVolume({
    types: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
    limit: 30,
  });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 연립·다세대 실거래가
      </h1>
      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 단지/건물 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
