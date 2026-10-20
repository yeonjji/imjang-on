/**
 * 학구도 교체 적재. 두 테이블을 한 트랜잭션에서 지우고 다시 넣는다.
 * 결과가 이전의 90% 미만이면 거부(빈·잘린 다운로드 사고 방지).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { markPrimaries, type LinkInput, type ZoneInput } from './parse';

export const MIN_KEEP_RATIO = 0.9;

/**
 * 학교 매칭: 이름 + 시·도 교육청. 후보가 1곳이면 학구에서 10km 이내, 여러 곳이면 3km 이내가
 * 정확히 1곳일 때만 채택한다. 이름 유사 매칭은 하지 않는다(실측: '영산포초→산포초' 오매칭).
 */
async function matchSchools(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    UPDATE "SchoolZoneSchool" t SET "schoolId" = m.id
    FROM (
      SELECT "hakgudoId", "schId", MIN(id) AS id
      FROM (
        SELECT s."hakgudoId", s."schId", sc.id,
               ST_Distance(sc.location, z.geom::geography) AS d,
               COUNT(*) OVER (PARTITION BY s."hakgudoId", s."schId") AS n
        FROM "SchoolZoneSchool" s
        JOIN "SchoolZone" z ON z."hakgudoId" = s."hakgudoId"
        JOIN "School" sc ON sc.name = s."schoolName" AND sc."eduOffice" = s."eduOffice" AND sc.location IS NOT NULL
      ) c
      WHERE (n = 1 AND d < 10000) OR (n > 1 AND d < 3000)
      GROUP BY "hakgudoId", "schId"
      HAVING COUNT(*) = 1
    ) m
    WHERE t."hakgudoId" = m."hakgudoId" AND t."schId" = m."schId"`;
}

export async function replaceSchoolZones(
  zones: ZoneInput[],
  links: LinkInput[],
  opts: { srid?: number } = {},
): Promise<{ zones: number; links: number; matched: number }> {
  const srid = opts.srid ?? 5186;
  const ids = new Set(zones.map((z) => z.hakgudoId));
  const seen = new Set<string>();
  const rows = markPrimaries(zones, links).filter((l) => {
    const k = `${l.hakgudoId}|${l.schId}`;
    if (!ids.has(l.hakgudoId) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return prisma.$transaction(
    async (tx) => {
      const prev = await tx.schoolZone.count();
      if (prev > 0 && ids.size < prev * MIN_KEEP_RATIO) {
        throw new Error(`학구 ${ids.size}개 < 이전 ${prev}개의 90% — 적재 거부`);
      }
      await tx.$executeRaw`DELETE FROM "SchoolZone"`; // SchoolZoneSchool은 CASCADE
      for (const z of zones) {
        await tx.$executeRaw`
          INSERT INTO "SchoolZone" ("hakgudoId", name, kind, "eduName", "baseDate", geom)
          VALUES (${z.hakgudoId}, ${z.name}, ${z.kind}, ${z.eduName}, ${z.baseDate}::date,
            ST_Multi(ST_CollectionExtract(ST_MakeValid(
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(z.geometry)}), ${srid}::int), 4326)
            ), 3)))
          ON CONFLICT ("hakgudoId") DO UPDATE
            SET geom = ST_Multi(ST_CollectionExtract(ST_Union("SchoolZone".geom, EXCLUDED.geom), 3))`;
      }
      if (rows.length > 0) {
        await tx.schoolZoneSchool.createMany({
          data: rows.map((l) => ({ hakgudoId: l.hakgudoId, schId: l.schId, schoolName: l.schoolName, eduOffice: l.eduOffice, isPrimary: l.isPrimary })),
        });
      }
      const matched = await matchSchools(tx);
      return { zones: await tx.schoolZone.count(), links: rows.length, matched };
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
}
