import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { SourceCaption } from '@/components/ui/source-caption';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';
import { Faq } from '../_components/faq';
import { HubGuide } from '../_components/hub-guide';

export const metadata: Metadata = {
  title: '전국 아파트 실거래가',
  description: '전국 아파트 매매·전세·월세 실거래가를 단지별로. 평균 시세·거래량·최근 거래 흐름을 공공데이터로 매일 업데이트.',
  alternates: { canonical: '/apt' },
};

// 빌드 타임 Supabase 커넥션 풀 경합(P2024)으로 정적 프리렌더가 불안정하다.
// 런타임 DB는 정상이므로 force-dynamic으로 요청 시점에 렌더한다. (홈과 동일 전략)
export const dynamic = 'force-dynamic';

export default async function AptHubPage() {
  // 런타임 DB 블립 시에도 페이지가 죽지 않도록 빈 목록으로 폴백
  const popular = await getTopPropertiesByVolume({ types: [PropertyType.APARTMENT], limit: 30 })
    .catch((err) => {
      console.error('AptHubPage: popular query failed', err);
      return [];
    });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 아파트 실거래가
      </h1>
      <p className="mt-3 max-w-xl text-[var(--color-muted)]">
        공공데이터 기반 · 매일 갱신 · 매매/전세/월세 통합
      </p>
      <HubGuide category="apt" />

      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 단지 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>

      <SourceCaption ids={['molit-rtms']} />

      <Faq category="apt" />
    </section>
  );
}
