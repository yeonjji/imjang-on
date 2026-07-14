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

// 홈 데이터는 일일 ETL 스냅샷/추정치라 ISR로 캐시한다(15분). 매 요청 원본 렌더 대신
// 캐시를 서빙해 Fast Origin Transfer·Fluid를 절감한다. 빌드타임 빈 프리렌더는
// 배포 후 warm-hub-cache 워크플로가 revalidate + 워밍으로 즉시 실데이터로 교체한다.
export const revalidate = 900;

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
