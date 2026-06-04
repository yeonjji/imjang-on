import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { parsePharmacyRows } from '@/scripts/ingest/amenities/adapter-pharmacy';
import type { NormalizedPharmacy } from '@/scripts/ingest/amenities/types';
import { enrichWithGeocode } from '@/scripts/ingest/amenities/geocode-fill';

const CHUNK = 1000;

function parseArgs(): { dir: string } {
  const args = process.argv.slice(2);
  const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1];
  if (!dir) throw new Error('--dir=<xlsx 디렉토리 경로> 가 필요합니다');
  return { dir };
}

function findXlsx(dir: string, fileNum: number): string {
  const prefix = `${fileNum}.`;
  const found = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.xlsx'));
  if (!found) throw new Error(`${dir} 에서 "${prefix}"로 시작하는 xlsx 파일을 찾을 수 없습니다`);
  return join(dir, found);
}

function dedupeBySourceId<T extends { sourceId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.sourceId, r);
  return Array.from(map.values());
}

function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

async function writePharmacies(rows: NormalizedPharmacy[]): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r) =>
      Prisma.sql`(
        ${r.sourceId}, ${r.name}, ${r.typeCode}, ${r.typeName},
        ${r.sido}, ${r.sigungu}, ${r.sigunguCode}, ${r.eupmyeondong}, ${r.zipcode},
        ${r.address}, ${r.tel}, ${r.openedAt},
        ${locationSql(r.lat, r.lng)}, NOW()
      )`,
    );
    await prisma.$executeRaw`
      INSERT INTO "Pharmacy" (
        "sourceId", name, "typeCode", "typeName",
        sido, sigungu, "sigunguCode", eupmyeondong, zipcode,
        address, tel, "openedAt",
        location, "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        "typeCode" = EXCLUDED."typeCode",
        "typeName" = EXCLUDED."typeName",
        sido = EXCLUDED.sido,
        sigungu = EXCLUDED.sigungu,
        "sigunguCode" = EXCLUDED."sigunguCode",
        eupmyeondong = EXCLUDED.eupmyeondong,
        zipcode = EXCLUDED.zipcode,
        address = EXCLUDED.address,
        tel = EXCLUDED.tel,
        "openedAt" = EXCLUDED."openedAt",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }
  return rows.length;
}

async function main() {
  const { dir } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'amenity-pharmacy', targetKey: 'all', status: 'RUNNING' },
  });

  try {
    logger.info('pharmacy: 파일2 파싱 중...');
    const rows = dedupeBySourceId(parsePharmacyRows(readXlsxRows(findXlsx(dir, 2))));
    await enrichWithGeocode(rows); // 소스 좌표 누락 행을 주소로 폴백 지오코딩
    const upserted = await writePharmacies(rows);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ upserted }, 'pharmacy ingest 완료');
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'ingest-pharmacy fatal');
  process.exit(1);
});
