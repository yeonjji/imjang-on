import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { streamEvChargers } from './adapter-ev-charger';
import { fetchAllTraditionalMarkets } from './adapter-traditional-market';
import { fetchStoresByUpjong, STORE_UPJONG_TARGETS } from './adapter-store';
import { fetchAllParks } from './adapter-park';
import { fetchAllSchools } from './adapter-school';
import { fetchAllChildcare } from './adapter-childcare';
import { AMENITY_INGEST_SOURCE } from './types';
import type {
  AmenitySourceKey,
  NormalizedEvCharger,
  NormalizedEvChargerUnit,
  NormalizedTraditionalMarket,
  NormalizedStore,
  NormalizedPark,
  NormalizedSchool,
  NormalizedChildcare,
} from './types';

// Pro Compute로 상향 후 청크를 키워 INSERT 횟수 감소
const CHUNK = 1000;
// Childcare는 컬럼이 ~74개라 1000 청크 시 bind 변수가 PG 한도(32767)를 초과한다.
const CHUNK_CHILDCARE = 400;

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
  if (!raw || !['ev-charger', 'traditional-market', 'store', 'park', 'school', 'childcare'].includes(raw)) {
    throw new Error(`--source must be one of: ev-charger, traditional-market, store, park, school, childcare. Got: ${raw}`);
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
      upserted = await ingestEvChargers(ingestSource);
    } else if (source === 'traditional-market') {
      upserted = await ingestTraditionalMarkets();
    } else if (source === 'park') {
      upserted = await ingestParks();
    } else if (source === 'school') {
      upserted = await ingestSchools();
    } else if (source === 'childcare') {
      upserted = await ingestChildcare();
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

async function writeEvChargerStations(stations: NormalizedEvCharger[]): Promise<void> {
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
        "operatorName" = EXCLUDED."operatorName",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }
}

async function writeEvChargerUnits(units: NormalizedEvChargerUnit[]): Promise<void> {
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
}

// chargerCount/chargeSpeed는 페이지(flush) 경계에 한 station의 충전기가 걸치면
// 부분 집계로 어긋날 수 있다. 전체 수집이 끝나면 EvChargerUnit 기준으로 정확히 재집계한다.
async function recomputeEvChargerAggregates(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "EvCharger" e SET
      "chargerCount" = sub.cnt,
      "chargeSpeed" = CASE WHEN sub.has_fast THEN '급속' ELSE '완속' END
    FROM (
      SELECT "stationSourceId", COUNT(*)::int AS cnt, bool_or("isFast") AS has_fast
      FROM "EvChargerUnit" GROUP BY "stationSourceId"
    ) sub
    WHERE e."sourceId" = sub."stationSourceId"
  `;
}

async function ingestEvChargers(ingestSource: string): Promise<number> {
  // resume 체크포인트: 마지막으로 flush 완료한 페이지를 rowsUpserted에 보관
  const cp = await prisma.ingestionRun.findFirst({
    where: { source: ingestSource, targetKey: 'checkpoint' },
    orderBy: { id: 'desc' },
  });

  let checkpointId: bigint;
  let startPage = 1;
  if (cp && cp.status !== 'OK') {
    startPage = cp.rowsUpserted + 1;
    checkpointId = cp.id;
    logger.info({ startPage }, 'ev-charger resuming from checkpoint');
  } else {
    const created = await prisma.ingestionRun.create({
      data: { source: ingestSource, targetKey: 'checkpoint', status: 'RUNNING', rowsUpserted: 0 },
    });
    checkpointId = created.id;
  }

  let totalStations = 0;
  let totalUnits = 0;

  const { complete, lastPage } = await streamEvChargers(startPage, async ({ result, lastPage }) => {
    const stations = dedupeBySourceId(result.stations);
    const units = dedupeBySourceId(result.units);
    await writeEvChargerStations(stations);
    await writeEvChargerUnits(units);
    totalStations += stations.length;
    totalUnits += units.length;
    await prisma.ingestionRun.update({
      where: { id: checkpointId },
      data: { status: 'RUNNING', rowsUpserted: lastPage },
    });
    logger.info({ lastPage, stations: stations.length, units: units.length }, 'ev-charger flush committed');
  });

  if (complete) await recomputeEvChargerAggregates();

  await prisma.ingestionRun.update({
    where: { id: checkpointId },
    data: {
      status: complete ? 'OK' : 'RUNNING',
      rowsUpserted: lastPage,
      finishedAt: complete ? new Date() : null,
    },
  });

  logger.info(
    { complete, lastPage, totalStations, totalUnits },
    complete ? 'ev-charger ingest complete' : 'ev-charger ingest partial — re-run to resume',
  );
  return totalStations;
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

async function ingestSchools(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllSchools());
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r: NormalizedSchool) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${locationSql(r.lat, r.lng)}, ${r.schoolKind ?? null}, ${r.foundType ?? null}, ${r.coeduType ?? null}, ${r.region ?? null}, ${r.eduOffice ?? null}, ${r.tel ?? null}, ${r.homepage ?? null}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "School" ("sourceId", name, address, location, "schoolKind", "foundType", "coeduType", region, "eduOffice", tel, homepage, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        location = EXCLUDED.location,
        "schoolKind" = EXCLUDED."schoolKind",
        "foundType" = EXCLUDED."foundType",
        "coeduType" = EXCLUDED."coeduType",
        region = EXCLUDED.region,
        "eduOffice" = EXCLUDED."eduOffice",
        tel = EXCLUDED.tel,
        homepage = EXCLUDED.homepage,
        "updatedAt" = NOW()
    `;
  }
  return rows.length;
}

// Childcare는 컬럼이 60+개라 수동 나열 대신 정규화 row의 키로 INSERT를 구성한다.
const CHILDCARE_COLUMNS: (keyof NormalizedChildcare)[] = [
  'sourceId', 'name', 'crType', 'status', 'vehicleOp', 'services',
  'sido', 'sigungu', 'sigunguCode', 'zipcode', 'address', 'tel', 'fax',
  'homepage', 'repName',
  'roomCount', 'roomSize', 'playgroundCount', 'cctvCount', 'staffCount',
  'capacity', 'currentCount',
  'confirmDate', 'pauseBeginDate', 'pauseEndDate', 'abolishDate', 'dataStdDate',
  'classCnt00', 'classCnt01', 'classCnt02', 'classCnt03', 'classCnt04', 'classCnt05',
  'classCntM2', 'classCntM3', 'classCntM5', 'classCntSp', 'classCntTot',
  'childCnt00', 'childCnt01', 'childCnt02', 'childCnt03', 'childCnt04', 'childCnt05',
  'childCntM2', 'childCntM3', 'childCntM5', 'childCntSp', 'childCntTot',
  'emTenure0y', 'emTenure1y', 'emTenure2y', 'emTenure4y', 'emTenure6y',
  'emRoleDirector', 'emRoleTeacher', 'emRoleSpecial', 'emRoleTherapy', 'emRoleNutrition',
  'emRoleNurse', 'emRoleNurseAssist', 'emRoleCook', 'emRoleOffice', 'emRoleTot',
  'waitCnt00', 'waitCnt01', 'waitCnt02', 'waitCnt03', 'waitCnt04', 'waitCnt05',
  'waitCntM6', 'waitCntTot',
];

async function ingestChildcare(): Promise<number> {
  const rows = dedupeBySourceId(await fetchAllChildcare());
  const cols = CHILDCARE_COLUMNS.map((c) => `"${c}"`).join(', ');
  // ON CONFLICT 시 sourceId 제외 전 컬럼 갱신
  const updates = CHILDCARE_COLUMNS.filter((c) => c !== 'sourceId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  for (let i = 0; i < rows.length; i += CHUNK_CHILDCARE) {
    const chunk = rows.slice(i, i + CHUNK_CHILDCARE);
    const values = chunk.map((r: NormalizedChildcare) => {
      const cells = CHILDCARE_COLUMNS.map((c) => Prisma.sql`${r[c] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, ${locationSql(r.lat, r.lng)}, NOW())`;
    });
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Childcare" (${Prisma.raw(cols)}, location, "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceId") DO UPDATE SET
          ${Prisma.raw(updates)},
          location = EXCLUDED.location,
          "updatedAt" = NOW()
      `,
    );
  }
  return rows.length;
}

async function ingestStores(): Promise<number> {
  let upserted = 0;
  // 생활인프라 업종(편의점/슈퍼/마트/약국/카페/병원/의원)만 업종 코드 단위로 수집
  for (const t of STORE_UPJONG_TARGETS) {
    const rows = dedupeBySourceId(await fetchStoresByUpjong(t.divId, t.code));
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
    logger.info({ label: t.label, code: t.code, count: rows.length }, 'store upjong done');
  }
  return upserted;
}

main().catch((err) => {
  logger.error({ err }, 'amenity runner fatal');
  process.exit(1);
});
