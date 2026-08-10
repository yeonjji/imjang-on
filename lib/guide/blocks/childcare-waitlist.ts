import { prisma } from '@/lib/db';

export interface ChildcareWaitRow {
  sido: string; sigungu: string; waitTotal: number; facilities: number;
}

/** 대기자가 있는 시군구 상위 10곳. sido·sigungu는 Childcare 자체 컬럼이라 조인이 없다. */
export async function getChildcareWaitlist(): Promise<ChildcareWaitRow[]> {
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
    orderBy: { _sum: { waitCntTot: 'desc' } },
    take: 10,
  });
  return rows.map((r) => ({
    sido: r.sido as string,
    sigungu: r.sigungu as string,
    waitTotal: r._sum.waitCntTot ?? 0,
    facilities: r._count._all,
  }));
}
