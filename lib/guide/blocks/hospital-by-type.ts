import { prisma } from '@/lib/db';

export interface HospitalTypeRow { typeName: string; count: number; avgDoctors: number | null }

/** 병원 종별 개수·평균 의사수. 일반병상은 HospitalFacility 관계라 groupBy로 못 담는다(계획 §스펙 차이). */
export async function getHospitalByType(): Promise<HospitalTypeRow[]> {
  const rows = await prisma.hospital.groupBy({
    by: ['typeName'],
    _count: { _all: true },
    _avg: { totalDoctors: true },
    orderBy: { _count: { typeName: 'desc' } },
  });
  return rows.map((r) => ({
    typeName: r.typeName,
    count: r._count._all,
    avgDoctors: r._avg.totalDoctors == null ? null : Math.round(r._avg.totalDoctors),
  }));
}
