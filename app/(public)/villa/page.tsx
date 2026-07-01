import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { SourceCaption } from '@/components/ui/source-caption';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';
import { HubSummary } from '../_components/hub-summary';
import { HubGuide } from '../_components/hub-guide';
import { getPropertyHubStats } from '@/lib/hub-summary/property';

export const metadata: Metadata = {
  title: '전국 연립·다세대 실거래가',
  description: '전국 연립·다세대 매매·전세·월세 실거래가. 단지별 시세·거래량을 공공데이터로 한눈에.',
  alternates: { canonical: '/villa' },
};

// 빌드 타임 Supabase 커넥션 풀 경합(P2024)으로 정적 프리렌더가 불안정하다.
// 런타임 DB는 정상이므로 force-dynamic으로 요청 시점에 렌더한다. (홈과 동일 전략)
export const dynamic = 'force-dynamic';

export default async function VillaHubPage() {
  // 런타임 DB 블립 시에도 페이지가 죽지 않도록 빈 목록으로 폴백
  const [popular, summary] = await Promise.all([
    getTopPropertiesByVolume({
      types: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
      limit: 30,
    }).catch((err) => {
      console.error('VillaHubPage: popular query failed', err);
      return [];
    }),
    getPropertyHubStats([PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX], '연립·다세대').catch(() => null),
  ]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 연립·다세대 실거래가
      </h1>
      <HubSummary data={summary} />
      <HubGuide category="villa" />
      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 단지/건물 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>

      <SourceCaption ids={['molit-rtms']} />

      <Faq category="villa" />
    </section>
  );
}
