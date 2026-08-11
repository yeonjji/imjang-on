import { prisma } from '@/lib/db';

export interface HospitalDeptRow { deptName: string; facilities: number; specialists: number }
export interface HospitalByDeptResult { rows: HospitalDeptRow[]; asOf: Date | null }

/**
 * 진료과목별 개설 기관 수와 전문의 합계 상위 12개. 435,588행 집계, 실측 109ms.
 *
 * 한 기관이 여러 과목을 개설하므로 기관 수 합계는 전체 의료기관 수보다 크다 — 호출부가 그렇게 표기한다.
 * `HospitalDept`에는 `updatedAt`이 없어 부모 `Hospital`의 최신 갱신일을 기준일로 쓴다.
 */
export async function getHospitalByDept(): Promise<HospitalByDeptResult> {
  const [rows, agg] = await Promise.all([
    prisma.hospitalDept.groupBy({
      by: ['deptName'],
      _count: { _all: true },
      _sum: { specialistCount: true },
      orderBy: { _sum: { specialistCount: 'desc' } },
      take: 12,
    }),
    prisma.hospital.aggregate({ _max: { updatedAt: true } }),
  ]);
  return {
    rows: rows.map((r) => ({
      deptName: r.deptName,
      facilities: r._count._all,
      specialists: r._sum.specialistCount ?? 0,
    })),
    asOf: agg._max.updatedAt ?? null,
  };
}
