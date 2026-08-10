import { prisma } from '@/lib/db';
import { latestUpdatedAt } from './shared';

export interface ChargerMixRow { chargeSpeed: string; stations: number; chargers: number }
export interface ChargerMixResult { rows: ChargerMixRow[]; asOf: Date | null }

/** 충전 속도별 지점 수·충전기 수. EvCharger에 sido 컬럼이 없어 지역 분해는 하지 않는다(계획 §스펙 차이). */
export async function getChargerMix(): Promise<ChargerMixResult> {
  const rows = await prisma.evCharger.groupBy({
    by: ['chargeSpeed'],
    _count: { _all: true },
    _sum: { chargerCount: true },
    _max: { updatedAt: true },
    orderBy: { _count: { chargeSpeed: 'desc' } },
  });
  return {
    rows: rows.map((r) => ({
      chargeSpeed: r.chargeSpeed,
      stations: r._count._all,
      chargers: r._sum.chargerCount ?? 0,
    })),
    asOf: latestUpdatedAt(rows.map((r) => r._max.updatedAt)),
  };
}
