import { TypeHub } from './_components/type-hub';
import { HeroSection } from './_components/hero-section';
import { StatsBar } from './_components/stats-bar';
import { AmenityHub } from './_components/amenity-hub';
import { MarketBriefing } from './_components/market-briefing';
import { WeeklySubscriptionBoard } from './_components/weekly-subscription-board';
import { HomeNews } from './_components/home-news';
import { HomeEditorial } from './_components/home-editorial';
import { DongTransactionPanel } from './_components/dong-transaction-panel';
import { heroRowClass } from './_components/home-layout';
import { getHomeStats } from '@/lib/stats';
import { getHomeWeekBoard } from '@/lib/subscription';
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import { getHomeLatestPosts } from '@/lib/board/post';
import { isBoardPublic } from '@/lib/board/visibility';
import { getSidoList } from '@/lib/region';
import { readDongOptions, pickTopDong } from '@/lib/dong-options';
import { getDongTransactions } from '@/lib/transaction/dong';
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
  const [stats, snapshot, weeklyBoard, latestPosts, sidoList] = await Promise.all([
    safe(getHomeStats(), { transactions: 0, properties: 0, schools: 0, lifeFacilities: 0 }),
    // 브리핑·인기지역은 5M행 집계라 요청 경로에서 너무 느리다. 일일 ingest가 미리 계산해 둔 스냅샷을 즉시 읽는다.
    safe(readHomeSnapshot(), { briefing: null, popularRegions: [] }),
    safe(getHomeWeekBoard(), {
      summary: { open: 0, upcoming: 0, closed: 0 },
      total: 0,
      days: [],
    }),
    safe(isBoardPublic() ? getHomeLatestPosts(5) : Promise.resolve([]), []),
    safe(getSidoList(), []),
  ]);
  const { briefing, popularRegions } = snapshot;

  // 히어로 오른쪽 동네 거래 패널의 첫 화면은 인기 지역 1위 시군구의 거래 최다 동을
  // 서버가 그린다. 드롭다운을 바꾸면 그때부터 클라이언트가 조회한다.
  // topDong은 dongs에서 파생한다 — 같은 시군구의 동 목록 스냅샷을 두 번 읽지 않는다.
  const top = popularRegions[0] ?? null;
  const dongs = top ? await safe(readDongOptions(top.sigunguCode), []) : [];
  const topDong = pickTopDong(dongs);
  const dongItems =
    top && topDong
      ? await safe(
          getDongTransactions({
            sigunguCode: top.sigunguCode,
            umd: topDong.umd,
            propertyType: 'APARTMENT',
            limit: 12,
          }),
          [],
        )
      : [];

  const panel =
    top && topDong ? (
      <DongTransactionPanel
        initialSido={top.sido}
        initialSigunguCode={top.sigunguCode}
        initialSigunguName={top.sigungu}
        initialUmd={topDong.umd}
        initialDongs={dongs}
        initialItems={dongItems}
        sidoList={sidoList}
      />
    ) : null;

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <div className={heroRowClass(panel !== null)}>
        <HeroSection popularRegions={popularRegions} />
        {panel}
      </div>

      {/* 통계는 두 영역 아래 전체폭(1132px) 밴드다. 히어로 안에 있으면 히어로가
          길어져 오른쪽 카드와의 높이 균형이 무너진다. */}
      <div className="mt-6">
        <StatsBar stats={stats} />
      </div>

      <MarketBriefing briefing={briefing} />

      <WeeklySubscriptionBoard board={weeklyBoard} />

      <div className="mt-10">
        <TypeHub />
      </div>

      <AmenityHub />

      <HomeNews posts={latestPosts} />

      <HomeEditorial />
    </section>
  );
}
