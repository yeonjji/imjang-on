import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getMarketBriefing, type MarketBriefing } from '@/lib/briefing';
import { getPopularSigungus, type PopularRegion } from '@/lib/region';

const KEY_BRIEFING = 'market_briefing';
const KEY_POPULAR = 'popular_sigungus';

export interface HomeSnapshot {
  briefing: MarketBriefing | null;
  popularRegions: PopularRegion[];
}

/**
 * ETL에서 호출: 무거운 transaction 집계(브리핑·인기지역)를 계산해 스냅샷 테이블에 저장한다.
 * 요청 경로가 아닌 일일 ingest(함수 타임아웃 없음)에서 실행하는 것을 전제로 한다.
 */
export async function writeHomeSnapshot(): Promise<void> {
  const [briefing, popularRegions] = await Promise.all([
    getMarketBriefing(),
    getPopularSigungus(),
  ]);

  // Prisma의 Json 입력 타입은 인터페이스를 직접 받지 못하므로 InputJsonValue로 캐스팅한다.
  const briefingJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    briefing === null ? Prisma.JsonNull : (briefing as unknown as Prisma.InputJsonValue);
  const popularJson = popularRegions as unknown as Prisma.InputJsonValue;

  await prisma.$transaction([
    prisma.dashboardSnapshot.upsert({
      where: { key: KEY_BRIEFING },
      create: { key: KEY_BRIEFING, payload: briefingJson },
      update: { payload: briefingJson },
    }),
    prisma.dashboardSnapshot.upsert({
      where: { key: KEY_POPULAR },
      create: { key: KEY_POPULAR, payload: popularJson },
      update: { payload: popularJson },
    }),
  ]);
}

/** 홈에서 호출: 사전계산된 스냅샷을 즉시 읽는다. 없으면 빈 값. */
export async function readHomeSnapshot(): Promise<HomeSnapshot> {
  const rows = await prisma.dashboardSnapshot.findMany({
    where: { key: { in: [KEY_BRIEFING, KEY_POPULAR] } },
  });
  const briefingRow = rows.find((r) => r.key === KEY_BRIEFING);
  const popularRow = rows.find((r) => r.key === KEY_POPULAR);

  return {
    briefing: (briefingRow?.payload as unknown as MarketBriefing | null) ?? null,
    popularRegions: (popularRow?.payload as unknown as PopularRegion[]) ?? [],
  };
}
