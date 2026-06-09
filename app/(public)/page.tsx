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

// Vercel 빌드 환경은 Supabase에 접근하지 못해 정적 프리렌더가 빈 데이터로 구워진다.
// 런타임 DB는 정상이므로 요청 시점에 동적 렌더하여 항상 실제 데이터를 보여준다.
export const dynamic = 'force-dynamic';

/**
 * 런타임 DB 블립(커넥션 한계 등)으로 일부 쿼리가 실패해도
 * 페이지 전체가 죽지 않도록 항목별 fallback으로 폴백한다.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error('[home] data fetch failed during render, using fallback', err);
    return fallback;
  }
}

/**
 * 느린 집계 쿼리가 홈 렌더 전체를 멈추지 않도록 시간 상한을 둔다.
 * 상한 초과 시 fallback으로 즉시 폴백(쿼리는 DB statement_timeout이 정리).
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function HomePage() {
  const [sidoList, stats, briefing, popularRegions, weeklyBoard] = await Promise.all([
    getSidoList(),
    safe(getHomeStats(), { transactions: 0, properties: 0, schools: 0, lifeFacilities: 0 }),
    withTimeout(safe(getMarketBriefing(), null), 6000, null),
    withTimeout(safe(getPopularSigungus(), []), 6000, []),
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
