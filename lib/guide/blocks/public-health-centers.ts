import { prisma } from '@/lib/db';

export interface PublicHealthRow { typeName: string; count: number; sidoCount: number }
export interface PublicHealthResult { rows: PublicHealthRow[]; asOf: Date | null }

/**
 * 보건소·보건지소·보건진료소·보건의료원 수와 그 기관이 있는 시도 수. 실측 3,450곳, 74ms.
 * 시도 수만 쓰고 지역명은 노출하지 않는다 — 2026-07-01 행정구역 개편이 아직 소스에 반영되지 않았다.
 */
export async function getPublicHealthCenters(): Promise<PublicHealthResult> {
  const [rows, agg] = await Promise.all([
    prisma.$queryRaw<Array<{ type_name: string; n: bigint; sido_count: bigint }>>`
      SELECT "typeName" AS type_name, COUNT(*) AS n, COUNT(DISTINCT sido) AS sido_count
      FROM "Hospital"
      WHERE "typeName" LIKE '보건%'
      GROUP BY "typeName"
      ORDER BY COUNT(*) DESC
    `,
    prisma.hospital.aggregate({ _max: { updatedAt: true } }),
  ]);
  return {
    rows: rows.map((r) => ({
      typeName: r.type_name,
      count: Number(r.n),
      sidoCount: Number(r.sido_count),
    })),
    asOf: agg._max.updatedAt ?? null,
  };
}
