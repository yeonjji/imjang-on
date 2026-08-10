import { prisma } from '@/lib/db';

export interface ChargerMixRow { chargeSpeed: string; stations: number; chargers: number }

/** 충전 속도별 지점 수·충전기 수. EvCharger에 sido 컬럼이 없어 지역 분해는 하지 않는다(계획 §스펙 차이). */
export async function getChargerMix(): Promise<ChargerMixRow[]> {
  const rows = await prisma.evCharger.groupBy({
    by: ['chargeSpeed'],
    _count: { _all: true },
    _sum: { chargerCount: true },
    orderBy: { _count: { chargeSpeed: 'desc' } },
  });
  return rows.map((r) => ({
    chargeSpeed: r.chargeSpeed,
    stations: r._count._all,
    chargers: r._sum.chargerCount ?? 0,
  }));
}
