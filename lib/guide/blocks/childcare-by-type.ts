import { prisma } from '@/lib/db';

export interface ChildcareTypeRow {
  crType: string; count: number; avgCapacity: number | null; avgCurrent: number | null;
}

/** 어린이집 유형별 개수·평균 정원·평균 현원. 운영중(정상·재개)만 센다. */
export async function getChildcareByType(): Promise<ChildcareTypeRow[]> {
  const rows = await prisma.childcare.groupBy({
    by: ['crType'],
    where: { OR: [{ status: { in: ['정상', '재개'] } }, { status: null }] },
    _count: { _all: true },
    _avg: { capacity: true, currentCount: true },
    orderBy: { _count: { crType: 'desc' } },
  });
  return rows
    .filter((r): r is typeof r & { crType: string } => r.crType !== null)
    .map((r) => ({
      crType: r.crType,
      count: r._count._all,
      avgCapacity: r._avg.capacity == null ? null : Math.round(r._avg.capacity),
      avgCurrent: r._avg.currentCount == null ? null : Math.round(r._avg.currentCount),
    }));
}
