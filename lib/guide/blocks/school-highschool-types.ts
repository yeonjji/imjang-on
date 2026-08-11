import { prisma } from '@/lib/db';
import { latestUpdatedAt } from './shared';

export interface SchoolTypeRow { foundType: string; coeduType: string; count: number }
export interface SchoolHighschoolTypesResult { rows: SchoolTypeRow[]; asOf: Date | null }

/**
 * 고등학교를 설립유형 × 남녀공학 구분으로 집계. 실측 2,454곳 9조합, 7.5ms.
 * 라벨은 교육부 원본 표기를 그대로 쓴다(`남여공학` — 임의로 `남녀공학`으로 고치지 않는다).
 */
export async function getSchoolHighschoolTypes(): Promise<SchoolHighschoolTypesResult> {
  const rows = await prisma.school.groupBy({
    by: ['foundType', 'coeduType'],
    where: { schoolKind: '고등학교', foundType: { not: null }, coeduType: { not: null } },
    _count: { _all: true },
    _max: { updatedAt: true },
    orderBy: { _count: { foundType: 'desc' } },
  });
  return {
    rows: rows.map((r) => ({
      foundType: r.foundType ?? '-',
      coeduType: r.coeduType ?? '-',
      count: r._count._all,
    })),
    asOf: latestUpdatedAt(rows.map((r) => r._max.updatedAt)),
  };
}
