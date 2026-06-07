import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { clusterStations, type RawStationRow } from '@/scripts/ingest/subway/cluster';

const DEFAULT_FILE = 'data/subway.xlsx';
const CHUNK = 500;

function parseArgs(): { file: string } {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.startsWith('--file='))?.split('=')[1] ?? DEFAULT_FILE;
  return { file };
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRawRows(rows: Record<string, unknown>[]): RawStationRow[] {
  const out: RawStationRow[] = [];
  for (const r of rows) {
    const lat = num(r['역위도']);
    const lng = num(r['역경도']);
    const name = String(r['역사명'] ?? '').trim();
    const lineName = String(r['노선명'] ?? '').trim();
    if (!name || !lineName || lat == null || lng == null) continue;
    const std = r['데이터기준일자'];
    out.push({
      name,
      lineName,
      operator: r['운영기관명'] ? String(r['운영기관명']).trim() : null,
      address: r['역사도로명주소'] ? String(r['역사도로명주소']).trim() : null,
      lat,
      lng,
      dataStdDate: (() => {
        const d = std instanceof Date ? std : std ? new Date(String(std)) : null;
        return d && Number.isFinite(d.getTime()) ? d : null;
      })(),
    });
  }
  return out;
}

function locationSql(lat: number, lng: number) {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

async function main() {
  const { file } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'subway', targetKey: 'stations', status: 'RUNNING' },
  });
  try {
    logger.info({ file }, 'subway: xlsx 파싱 중...');
    const raw = toRawRows(readXlsxRows(file));
    const clusters = clusterStations(raw);
    logger.info({ rawRows: raw.length, clusters: clusters.length }, 'subway: 클러스터링 완료');

    for (let i = 0; i < clusters.length; i += CHUNK) {
      const chunk = clusters.slice(i, i + CHUNK);
      const values = chunk.map((c) => {
        const dateVal = c.dataStdDate?.toISOString() ?? null;
        return Prisma.sql`(
          ${c.name}, ${normalizeName(c.name)}, ${c.lines}, ${c.operators},
          ${c.address}, ${c.isTransfer}, ${locationSql(c.lat, c.lng)},
          ${dateVal}::date, ${c.sourceKey}, NOW()
        )`;
      });
      await prisma.$executeRaw`
        INSERT INTO "SubwayStation" (
          name, "nameNorm", lines, operators, address, "isTransfer",
          location, "dataStdDate", "sourceKey", "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceKey") DO UPDATE SET
          name = EXCLUDED.name,
          "nameNorm" = EXCLUDED."nameNorm",
          lines = EXCLUDED.lines,
          operators = EXCLUDED.operators,
          address = EXCLUDED.address,
          "isTransfer" = EXCLUDED."isTransfer",
          location = EXCLUDED.location,
          "dataStdDate" = EXCLUDED."dataStdDate",
          "updatedAt" = NOW()
      `;
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: clusters.length, finishedAt: new Date() },
    });
    logger.info({ upserted: clusters.length }, 'subway ingest 완료');
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
  logger.error({ err }, 'ingest-subway fatal');
  process.exit(1);
});
