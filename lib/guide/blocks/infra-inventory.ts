import { prisma } from '@/lib/db';

export interface InfraInventoryRow { label: string; count: number }
export interface InfraInventoryResult { rows: InfraInventoryRow[]; total: number }

/**
 * 임장ON이 수집해 보관 중인 생활 인프라 시설 수. 각 테이블 COUNT(*) 실측 7ms
 * (대상이 전부 10만 행 이하라 pg_class 추정치를 쓸 이유가 없다 — `lib/stats.ts`의 추정은
 * 7.6M행 Transaction 때문이다).
 *
 * **기준일을 달지 않는다.** 소스마다 갱신 주기가 달라 하나로 묶으면 거짓이 된다.
 */
export async function getInfraInventory(): Promise<InfraInventoryResult> {
  const [charger, hospital, pharmacy, childcare, parking, park, school, market, subway] =
    await Promise.all([
      prisma.evCharger.count(),
      prisma.hospital.count(),
      prisma.pharmacy.count(),
      prisma.childcare.count(),
      prisma.parking.count(),
      prisma.park.count(),
      prisma.school.count(),
      prisma.traditionalMarket.count(),
      prisma.subwayStation.count(),
    ]);

  const rows: InfraInventoryRow[] = [
    { label: '전기차 충전소', count: charger },
    { label: '병원·의원', count: hospital },
    { label: '약국', count: pharmacy },
    { label: '어린이집', count: childcare },
    { label: '주차장', count: parking },
    { label: '공원', count: park },
    { label: '학교', count: school },
    { label: '전통시장', count: market },
    { label: '지하철역', count: subway },
  ].sort((a, b) => b.count - a.count);

  return { rows, total: rows.reduce((s, r) => s + r.count, 0) };
}
