import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAllEvChargers } from './adapter-ev-charger';
import { fetchAllTraditionalMarkets } from './adapter-traditional-market';
import { fetchStoresBySigungu } from './adapter-store';
import { fetchAllSchools } from './adapter-school';
import { fetchAllParks } from './adapter-park';
import { AMENITY_INGEST_SOURCE } from './types';
import type { AmenitySourceKey } from './types';

function parseArgs(): { source: AmenitySourceKey } {
  const args = process.argv.slice(2);
  const raw = args.find((a) => a.startsWith('--source='))?.split('=')[1];
  if (!raw || !['ev-charger', 'traditional-market', 'store', 'school', 'park'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store, school, park. Got: ${raw}`);
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
    } else if (source === 'school') {
      upserted = await ingestSchools();
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
  const rows = await fetchAllEvChargers();
  let upserted = 0;
  for (const row of rows) {
    await prisma.evCharger.upsert({
      where: { sourceId: row.sourceId },
      create: { sourceId: row.sourceId, name: row.name, address: row.address, chargeSpeed: row.chargeSpeed, chargerCount: row.chargerCount, operatorName: row.operatorName },
      update: { name: row.name, address: row.address, chargeSpeed: row.chargeSpeed, chargerCount: row.chargerCount, operatorName: row.operatorName },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "EvCharger"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestTraditionalMarkets(): Promise<number> {
  const rows = await fetchAllTraditionalMarkets();
  let upserted = 0;
  for (const row of rows) {
    await prisma.traditionalMarket.upsert({
      where: { sourceId: row.sourceId },
      create: { sourceId: row.sourceId, name: row.name, address: row.address, marketType: row.marketType },
      update: { name: row.name, address: row.address, marketType: row.marketType },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "TraditionalMarket"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestStores(): Promise<number> {
  const sigunguRecords = await prisma.region.findMany({
    where: { level: 2, isAbolished: false },
    select: { code: true },
  });
  const sigunguCodes = [...new Set(sigunguRecords.map((r) => r.code.slice(0, 5)))];

  let upserted = 0;
  for (const sigunguCode of sigunguCodes) {
    const rows = await fetchStoresBySigungu(sigunguCode);
    for (const row of rows) {
      await prisma.store.upsert({
        where: { sourceId: row.sourceId },
        create: { sourceId: row.sourceId, name: row.name, address: row.address, industryCode: row.industryCode, industryName: row.industryName, sigunguCode: row.sigunguCode },
        update: { name: row.name, address: row.address, industryCode: row.industryCode, industryName: row.industryName, sigunguCode: row.sigunguCode },
      });
      if (row.lat && row.lng) {
        await prisma.$executeRaw`
          UPDATE "Store"
          SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
          WHERE "sourceId" = ${row.sourceId}
        `;
      }
      upserted++;
    }
    logger.info({ sigunguCode, count: rows.length }, 'store sigungu done');
  }
  return upserted;
}

async function ingestSchools(): Promise<number> {
  const rows = await fetchAllSchools();
  let upserted = 0;
  for (const row of rows) {
    await prisma.school.upsert({
      where: { sourceId: row.sourceId },
      create: {
        sourceId: row.sourceId,
        name: row.name,
        address: row.address,
        schoolLevel: row.schoolLevel,
        schoolType: row.schoolType,
      },
      update: {
        name: row.name,
        address: row.address,
        schoolLevel: row.schoolLevel,
        schoolType: row.schoolType,
      },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "School"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

async function ingestParks(): Promise<number> {
  const rows = await fetchAllParks();
  let upserted = 0;
  for (const row of rows) {
    await prisma.park.upsert({
      where: { sourceId: row.sourceId },
      create: {
        sourceId: row.sourceId,
        name: row.name,
        address: row.address,
        parkType: row.parkType,
        area: row.area,
      },
      update: {
        name: row.name,
        address: row.address,
        parkType: row.parkType,
        area: row.area,
      },
    });
    if (row.lat && row.lng) {
      await prisma.$executeRaw`
        UPDATE "Park"
        SET location = ST_SetSRID(ST_MakePoint(${row.lng}, ${row.lat}), 4326)::geography
        WHERE "sourceId" = ${row.sourceId}
      `;
    }
    upserted++;
  }
  return upserted;
}

main().catch((err) => {
  logger.error({ err }, 'amenity runner fatal');
  process.exit(1);
});
