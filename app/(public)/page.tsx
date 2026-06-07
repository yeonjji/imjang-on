import { MainSearchFilter } from './_components/main-search-filter';
import { TypeHub } from './_components/type-hub';
import { HeroSection } from './_components/hero-section';
import { StatsBar } from './_components/stats-bar';
import { AmenityHub } from './_components/amenity-hub';
import { MarketBriefing } from './_components/market-briefing';
import { WeeklySubscriptionBoard } from './_components/weekly-subscription-board';
import { getSidoList, getPopularSigungus } from '@/lib/region';
import { getHomeStats } from '@/lib/stats';
import { getMarketBriefing } from '@/lib/briefing';
import { getWeeklySubscriptions } from '@/lib/subscription';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 단지 단위로 한눈에.',
};

export const revalidate = 3600;

/**
 * 빌드 시 정적 프리렌더 중 DB 블립(커넥션 한계 등)으로 쿼리가 실패해도
 * 빌드 전체가 죽지 않도록 fallback으로 폴백한다. ISR 재검증 시 실제 데이터로 채워진다.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error('[home] data fetch failed during render, using fallback', err);
    return fallback;
  }
}

export default async function HomePage() {
  const [sidoList, stats, briefing, popularRegions, weeklyBoard] = await Promise.all([
    getSidoList(),
    safe(getHomeStats(), { transactions: 0, properties: 0, schools: 0, lifeFacilities: 0 }),
    safe(getMarketBriefing(), null),
    safe(getPopularSigungus(), []),
    safe(getWeeklySubscriptions(), {
      weekStart: new Date(),
      weekEnd: new Date(),
      days: [],
      summary: { open: 0, upcoming: 0, closed: 0 },
      total: 0,
    }),
  ]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <HeroSection popularRegions={popularRegions} />
      <StatsBar stats={stats} />

      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-stretch">
        <div id="search-filter" className="min-w-0 flex-1 scroll-mt-24">
          <MainSearchFilter sidoList={sidoList} />
        </div>
        <aside className="w-full md:w-[380px] md:shrink-0">
          <TypeHub />
        </aside>
      </div>

      <MarketBriefing briefing={briefing} />

      <WeeklySubscriptionBoard board={weeklyBoard} />

      <AmenityHub />
    </section>
  );
}
