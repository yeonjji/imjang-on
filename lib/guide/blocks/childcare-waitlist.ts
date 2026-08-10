import { prisma } from '@/lib/db';
import { latestUpdatedAt } from './shared';

export interface ChildcareWaitRow {
  sido: string; sigungu: string; waitTotal: number; facilities: number;
}
export interface ChildcareWaitlistResult { rows: ChildcareWaitRow[]; asOf: Date | null }

/**
 * 대기자가 있는 시군구 상위 10곳. sido·sigungu는 Childcare 자체 컬럼이라 조인이 없다.
 * waitTotal은 waitCntTot(시설별 대기 "등록" 수)의 합이다 — 한 아동이 여러 어린이집에 동시에
 * 등록할 수 있어 대기 "아동" 수가 아니라 등록 건수다. 라벨은 호출부에서 그렇게 표기해야 한다.
 */
export async function getChildcareWaitlist(): Promise<ChildcareWaitlistResult> {
  const rows = await prisma.childcare.groupBy({
    by: ['sido', 'sigungu'],
    where: {
      waitCntTot: { gt: 0 },
      sido: { not: null },
      sigungu: { not: null },
      OR: [{ status: { in: ['정상', '재개'] } }, { status: null }],
    },
    _sum: { waitCntTot: true },
    _count: { _all: true },
    _max: { updatedAt: true },
    orderBy: { _sum: { waitCntTot: 'desc' } },
    take: 10,
  });
  return {
    rows: rows.map((r) => ({
      sido: r.sido as string,
      sigungu: r.sigungu as string,
      waitTotal: r._sum.waitCntTot ?? 0,
      facilities: r._count._all,
    })),
    asOf: latestUpdatedAt(rows.map((r) => r._max.updatedAt)),
  };
}
