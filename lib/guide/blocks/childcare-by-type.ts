import { prisma } from '@/lib/db';
import { latestUpdatedAt } from './shared';

export interface ChildcareTypeRow {
  crType: string; count: number; avgCapacity: number | null; avgCurrent: number | null;
}
export interface ChildcareByTypeResult { rows: ChildcareTypeRow[]; asOf: Date | null }

/** 어린이집 유형별 개수·평균 정원·평균 현원. 운영중(정상·재개)만 센다. */
export async function getChildcareByType(): Promise<ChildcareByTypeResult> {
  const rows = await prisma.childcare.groupBy({
    by: ['crType'],
    where: { OR: [{ status: { in: ['정상', '재개'] } }, { status: null }] },
    _count: { _all: true },
    _avg: { capacity: true, currentCount: true },
    _max: { updatedAt: true },
    orderBy: { _count: { crType: 'desc' } },
  });
  return {
    rows: rows
      .filter((r): r is typeof r & { crType: string } => r.crType !== null)
      .map((r) => ({
        crType: r.crType,
        count: r._count._all,
        avgCapacity: r._avg.capacity == null ? null : Math.round(r._avg.capacity),
        avgCurrent: r._avg.currentCount == null ? null : Math.round(r._avg.currentCount),
      })),
    asOf: latestUpdatedAt(rows.map((r) => r._max.updatedAt)),
  };
}
