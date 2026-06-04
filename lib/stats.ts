import { prisma } from '@/lib/db';

export interface HomeStats {
  transactions: number;
  properties: number;
  schools: number;
  lifeFacilities: number;
}

/** 메인 통계바용 전체 카운트 집계 (page.tsx의 ISR로 캐시됨) */
export async function getHomeStats(): Promise<HomeStats> {
  const [
    transactions, properties, schools,
    ev, market, store, park, childcare, parking, hospital, pharmacy,
  ] = await Promise.all([
    prisma.transaction.count(),
    prisma.property.count(),
    prisma.school.count(),
    prisma.evCharger.count(),
    prisma.traditionalMarket.count(),
    prisma.store.count(),
    prisma.park.count(),
    prisma.childcare.count(),
    prisma.parking.count(),
    prisma.hospital.count(),
    prisma.pharmacy.count(),
  ]);

  return {
    transactions,
    properties,
    schools,
    lifeFacilities:
      ev + market + store + park + childcare + parking + hospital + pharmacy,
  };
}
