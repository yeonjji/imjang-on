import { TypeHub } from './_components/type-hub';
import { HeroSection } from './_components/hero-section';
import { StatsBar } from './_components/stats-bar';
import { AmenityHub } from './_components/amenity-hub';
import { MarketBriefing } from './_components/market-briefing';
import { WeeklySubscriptionBoard } from './_components/weekly-subscription-board';
import { HomeNews } from './_components/home-news';
import { getHomeStats } from '@/lib/stats';
import { getHomeWeekBoard } from '@/lib/subscription';
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import { getHomeLatestPosts } from '@/lib/board/post';
import { isBoardPublic } from '@/lib/board/visibility';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '아파트·오피스텔·빌라 실거래가부터 청약·학군·생활편의까지. 공공데이터로 보는 전국 부동산 시세를 한 곳에서 확인하세요.',
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

export default async function HomePage() {
  const [stats, snapshot, weeklyBoard, latestPosts] = await Promise.all([
    safe(getHomeStats(), { transactions: 0, properties: 0, schools: 0, lifeFacilities: 0 }),
    // 브리핑·인기지역은 5M행 집계라 요청 경로에서 너무 느리다. 일일 ingest가 미리 계산해 둔 스냅샷을 즉시 읽는다.
    safe(readHomeSnapshot(), { briefing: null, popularRegions: [] }),
    safe(getHomeWeekBoard(), {
      summary: { open: 0, upcoming: 0, closed: 0 },
      total: 0,
      days: [],
      bars: [],
    }),
    safe(isBoardPublic() ? getHomeLatestPosts(5) : Promise.resolve([]), []),
  ]);
  const { briefing, popularRegions } = snapshot;

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <HeroSection popularRegions={popularRegions} />
      <StatsBar stats={stats} />

      <MarketBriefing briefing={briefing} />

      <WeeklySubscriptionBoard board={weeklyBoard} />

      <div className="mt-10">
        <TypeHub />
      </div>

      <AmenityHub />

      <HomeNews posts={latestPosts} />
    </section>
  );
}
