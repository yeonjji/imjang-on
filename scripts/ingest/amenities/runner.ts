import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAllEvChargers } from './adapter-ev-charger';
import { fetchAllTraditionalMarkets } from './adapter-traditional-market';
import { fetchStoresBySigungu } from './adapter-store';
import { fetchAllParks } from './adapter-park';
import { AMENITY_INGEST_SOURCE } from './types';
import type {
  AmenitySourceKey,
  NormalizedEvCharger,
  NormalizedEvChargerUnit,
  NormalizedTraditionalMarket,
  NormalizedStore,
  NormalizedPark,
} from './types';

// Supabase pooler 기본 connection_limit이 작아 청크가 크면 P2024 timeout 발생
const CHUNK = 200;

// ON CONFLICT는 한 statement 안에서 같은 PK를 두 번 갱신하지 못해 21000 에러를 낸다.
// 외부 API가 동일 sourceId를 중복 반환하는 경우가 있어 INSERT 전에 sourceId 단위로 dedupe.
function dedupeBySourceId<T extends { sourceId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.sourceId, r);
  return Array.from(map.values());
}

// 좌표가 없으면 NULL geography를 INSERT하도록 분기 (geocode 실패한 amenity 대비)
function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

function parseArgs(): { source: AmenitySourceKey } {
  const args = process.argv.slice(2);
  const raw = args.find((a) => a.startsWith('--source='))?.split('=')[1];
  if (!raw || !['ev-charger', 'traditional-market', 'store', 'park'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store, park. Got: ${raw}`);
  }
  return { source: raw as AmenitySourceKey };
}

async function main() {
  const { source } = parseArgs();
  const ingestSource = AMENITY_INGEST_SOURCE[source];

  logger.info({ source }, 'amenity ingest start');

  const run = await prisma.ingestionRun.create({
    data: { source: ingestSource, targetKey: 'all', status: 'RUNNING' },
  });

  try {
    let upserted = 0;

    if (source === 'ev-charger') {
      upserted = await ingestEvChargers();
    } else if (source === 'traditional-market') {
      upserted = await ingestTraditionalMarkets();
    } else if (source === 'park') {
      upserted = await ingestParks();
    } else {
      upserted = await ingestStores();
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });

    const summary = { source, upserted };
    logger.info(summary, 'amenity ingest done');
    await notify('info', `amenity ingest complete: ${source}`, summary);
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    await notify('error', `amenity ingest failed: ${source}`, { err: String(err) });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function ingestEvChargers(): Promise<number> {
  const fetched = await fetchAllEvChargers();
  const stations = dedupeBySourceId(fetched.stations);
  const units = dedupeBySourceId(fetched.units);

  for (let i = 0; i < stations.length; i += CHUNK) {
    const chunk = stations.slice(i, i + CHUNK);
    const values = chunk.map((r: NormalizedEvCharger) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.chargeSpeed}, ${r.chargerCount}, ${r.operatorName ?? null}, ${locationSql(r.lat, r.lng)}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "EvCharger" ("sourceId", name, address, "chargeSpeed", "chargerCount", "operatorName", location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "chargeSpeed" = EXCLUDED."chargeSpeed",
        "chargerCount" = EXCLUDED."chargerCount",
        "operatorName" = EXCLUDED."operatorName",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }

  for (let i = 0; i < units.length; i += CHUNK) {
    const chunk = units.slice(i, i + CHUNK);
    const values = chunk.map((u: NormalizedEvChargerUnit) =>
      Prisma.sql`(${u.sourceId}, ${u.stationSourceId}, ${u.chgerId}, ${u.chgerType}, ${u.isFast}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "EvChargerUnit" ("sourceId", "stationSourceId", "chgerId", "chgerType", "isFast", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        "stationSourceId" = EXCLUDED."stationSourceId",
        "chgerId" = EXCLUDED."chgerId",
        "chgerType" = EXCLUDED."chgerType",
        "isFast" = EXCLUDED."isFast",
        "updatedAt" = NOW()
    `;
  }

  logger.info({ stations: stations.length, units: units.length }, 'ev-charger ingest summary');
  return stations.length;
}

async function ingestTraditionalMarkets(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllTraditionalMarkets());
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r: NormalizedTraditionalMarket) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.marketType ?? null}, ${locationSql(r.lat, r.lng)}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "TraditionalMarket" ("sourceId", name, address, "marketType", location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "marketType" = EXCLUDED."marketType",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }
  return rows.length;
}

async function ingestParks(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllParks());
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r: NormalizedPark) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.parkType ?? null}, ${r.area ?? null}, ${locationSql(r.lat, r.lng)}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "Park" ("sourceId", name, address, "parkType", area, location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "parkType" = EXCLUDED."parkType",
        area = EXCLUDED.area,
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }
  return rows.length;
}

async function ingestStores(): Promise<number> {
  const sigunguRecords = await prisma.region.findMany({
    where: { level: 2, isAbolished: false },
    select: { code: true },
  });
  const sigunguCodes = [...new Set(sigunguRecords.map((r) => r.code.slice(0, 5)))];

  let upserted = 0;
  const tasks = sigunguCodes.map((sigunguCode) => async () => {
    const rows = dedupeBySourceId(await fetchStoresBySigungu(sigunguCode));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = chunk.map((r: NormalizedStore) =>
        Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.industryCode ?? null}, ${r.industryName ?? null}, ${r.sigunguCode}, ${locationSql(r.lat, r.lng)}, NOW())`,
      );
      await prisma.$executeRaw`
        INSERT INTO "Store" ("sourceId", name, address, "industryCode", "industryName", "sigunguCode", location, "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceId") DO UPDATE SET
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          "industryCode" = EXCLUDED."industryCode",
          "industryName" = EXCLUDED."industryName",
          "sigunguCode" = EXCLUDED."sigunguCode",
          location = EXCLUDED.location,
          "updatedAt" = NOW()
      `;
    }
    upserted += rows.length;
    logger.info({ sigunguCode, count: rows.length }, 'store sigungu done');
  });

  // Supabase pooler 동시 연결 제약 → 동시성 낮게 유지
  await runWithLimit(tasks, 2);
  return upserted;
}

async function runWithLimit(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < tasks.length) {
      const i = nextIdx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

main().catch((err) => {
  logger.error({ err }, 'amenity runner fatal');
  process.exit(1);
});
