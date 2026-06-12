import { notFound } from 'next/navigation';
import { getSigunguByCode } from '@/lib/region';
import { getTopPropertiesByVolume, getRegionStats } from '@/lib/property';
import { PropertyCard } from '../../_components/property-card';
import { SourceCaption } from '@/components/ui/source-caption';
import { regionBlurb } from '@/lib/seo/blurb';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const r = await getSigunguByCode(code);
  if (!r) return {};
  return {
    title: `${r.fullName} 아파트 실거래가`,
    description: `${r.fullName}의 아파트·오피스텔·연립다세대 매매·전세·월세 실거래가.`,
    alternates: { canonical: `/region/${r.sigunguCode}` },
  };
}

export default async function RegionPage({ params }: Params) {
  const { code } = await params;
  const region = await getSigunguByCode(code);
  if (!region || !region.sigunguCode) notFound();

  const [apartments, stats] = await Promise.all([
    getTopPropertiesByVolume({
      types: [PropertyType.APARTMENT],
      sigunguCode: region.sigunguCode,
      limit: 12,
    }),
    getRegionStats(region.sigunguCode),
  ]);

  const blurbText = regionBlurb({
    fullName: region.fullName,
    complexCount: stats.complexCount,
    txCount12m: stats.txCount12m,
    saleAvgPrice12m: stats.saleAvgPrice12m,
    jeonseAvgDeposit12m: stats.jeonseAvgDeposit12m,
    priceMin: stats.priceMin,
    priceMax: stats.priceMax,
    topComplexNames: apartments.slice(0, 3).map((p) => p.name),
  });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: region.fullName, url: `${SITE_URL}/region/${region.sigunguCode}` },
          ]),
        ]}
      />
      <p className="text-sm text-[var(--color-muted)]">
        홈 › {region.sido} › {region.sigungu}
      </p>
      <h1 className="mt-2 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        {region.fullName} 부동산 실거래가
      </h1>
      <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-text)]">{blurbText}</p>

      <h2 className="mt-10 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 아파트 단지
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {apartments.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>

      <SourceCaption ids={['molit-rtms']} />
    </section>
  );
}
