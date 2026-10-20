import { prisma } from '@/lib/db';
import { buildSchoolZoneView, type SchoolZoneRow, type SchoolZoneView } from '@/lib/insights/school-zone';

/** 아파트 대표 좌표가 포함된 학구와 그 학교들. 좌표·학구가 없으면 null. GiST 인덱스 1회 조회. */
export async function getSchoolZoneView(propertyId: bigint): Promise<SchoolZoneView | null> {
  const rows = await prisma.$queryRaw<(Omit<SchoolZoneRow, 'distanceM'> & { distanceM: number | string | null })[]>`
    SELECT z."hakgudoId", z.name AS "zoneName", z.kind, z."eduName", z."baseDate",
           s."schoolName", s."isPrimary", s."schoolId", sc."sigunguCode" AS "schoolSigunguCode",
           CASE WHEN sc.location IS NOT NULL THEN ST_Distance(sc.location, p.location) END AS "distanceM"
    FROM "Property" p
    JOIN "SchoolZone" z ON ST_Contains(z.geom, p.location::geometry)
    JOIN "SchoolZoneSchool" s ON s."hakgudoId" = z."hakgudoId"
    LEFT JOIN "School" sc ON sc.id = s."schoolId"
    WHERE p.id = ${propertyId} AND p.location IS NOT NULL`;
  return buildSchoolZoneView(rows.map((r) => ({ ...r, distanceM: r.distanceM === null ? null : Number(r.distanceM) })));
}
