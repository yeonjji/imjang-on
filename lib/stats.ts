import { prisma } from '@/lib/db';

export interface HomeStats {
  transactions: number;
  properties: number;
  schools: number;
  lifeFacilities: number;
}

/**
 * 통계바 카운트는 대용량 테이블(transaction ~490만, property/store 수십만 행)에서
 * 전체 COUNT(*)가 Postgres statement timeout(코드 57014)에 걸린다.
 * pg_class 통계(reltuples)로 근사하면 즉시 반환되고 타임아웃을 피한다.
 * 통계바는 "490만+"처럼 근삿값으로 표기되므로 추정치로 충분하다.
 *
 * 한 항목의 실패가 통계바 전체를 0으로 무너뜨리지 않도록 개별 폴백(catch→0)한다.
 */
async function estimateCount(relname: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<{ est: bigint }[]>`
      SELECT reltuples::bigint AS est FROM pg_class WHERE relname = ${relname}
    `;
    const est = rows[0]?.est ?? 0n;
    return Number(est < 0n ? 0n : est);
  } catch (err) {
    console.error(`[stats] estimateCount(${relname}) failed, using 0`, err);
    return 0;
  }
}

/** 메인 통계바용 전체 카운트 집계 (page.tsx의 ISR로 캐시됨) */
export async function getHomeStats(): Promise<HomeStats> {
  const [
    transactions, properties, schools,
    ev, market, store, park, childcare, parking, hospital, pharmacy,
  ] = await Promise.all([
    estimateCount('Transaction'),
    estimateCount('Property'),
    estimateCount('School'),
    estimateCount('EvCharger'),
    estimateCount('TraditionalMarket'),
    estimateCount('Store'),
    estimateCount('Park'),
    estimateCount('Childcare'),
    estimateCount('Parking'),
    estimateCount('Hospital'),
    estimateCount('Pharmacy'),
  ]);

  return {
    transactions,
    properties,
    schools,
    lifeFacilities:
      ev + market + store + park + childcare + parking + hospital + pharmacy,
  };
}
