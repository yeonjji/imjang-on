import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import {
  parseHospitalRows,
  parseFacilityRows,
  parseDetailRows,
  parseDeptRows,
  parseTransitRows,
  parseEquipmentRows,
  parseMealSurchargeRows,
  parseNursingGradeRows,
  parseSpecialTreatmentRows,
  parseSpecialtyRows,
  parseStaffRows,
} from '@/scripts/ingest/amenities/adapter-hospital';
import type {
  NormalizedHospital,
  NormalizedHospitalFacility,
  NormalizedHospitalDetail,
  NormalizedHospitalDept,
  NormalizedHospitalTransit,
  NormalizedHospitalEquipment,
  NormalizedHospitalMealSurcharge,
  NormalizedHospitalNursingGrade,
  NormalizedHospitalSpecialTreatment,
  NormalizedHospitalSpecialty,
  NormalizedHospitalStaff,
} from '@/scripts/ingest/amenities/types';

const CHUNK = 500;
const CHUNK_DETAIL = 300;
const CHUNK_LARGE = 1000;

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

const HOSPITAL_COLS = [
  'sourceId', 'name', 'typeCode', 'typeName',
  'sido', 'sigungu', 'sigunguCode', 'eupmyeondong', 'zipcode',
  'address', 'tel', 'homepage', 'openedAt',
  'totalDoctors',
  'drMedGeneral', 'drMedIntern', 'drMedResident', 'drMedSpecialist',
  'drDentGeneral', 'drDentIntern', 'drDentResident', 'drDentSpecialist',
  'drKorGeneral', 'drKorIntern', 'drKorResident', 'drKorSpecialist',
  'midwifeCount',
] as const;
type HospitalCol = typeof HOSPITAL_COLS[number];

async function writeHospitals(rows: NormalizedHospital[]): Promise<number> {
  const cols = HOSPITAL_COLS.map((c) => `"${c}"`).join(', ');
  const updates = HOSPITAL_COLS.filter((c) => c !== 'sourceId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r) => {
      const cells = HOSPITAL_COLS.map((c) => Prisma.sql`${r[c as HospitalCol] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, ${locationSql(r.lat, r.lng)}, NOW())`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Hospital" (${Prisma.raw(cols)}, location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        ${Prisma.raw(updates)},
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `);
  }
  return rows.length;
}

async function buildIdMap(sourceIds: string[]): Promise<Map<string, bigint>> {
  const result = await prisma.$queryRaw<{ id: bigint; sourceId: string }[]>`
    SELECT id, "sourceId" FROM "Hospital" WHERE "sourceId" = ANY(${sourceIds})
  `;
  return new Map(result.map((r) => [r.sourceId, r.id]));
}

async function writeFacilities(rows: NormalizedHospitalFacility[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const chunk = mapped.slice(i, i + CHUNK);
    const values = chunk.map((r) => Prisma.sql`(
      ${r.hospitalId}, ${r.foundTypeCode}, ${r.foundTypeName},
      ${r.generalBedPremium}, ${r.generalBedNormal},
      ${r.icuAdultBed}, ${r.icuPediatricBed}, ${r.icuNeonatalBed},
      ${r.deliveryBed}, ${r.operatingRoomBed}, ${r.erBed}, ${r.physicalTherapyBed},
      ${r.psychiatryClosedPremium}, ${r.psychiatryClosedNormal},
      ${r.psychiatryOpenPremium}, ${r.psychiatryOpenNormal},
      ${r.isolationBed}, ${r.sterileRoomBed}, NOW()
    )`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalFacility" (
        "hospitalId", "foundTypeCode", "foundTypeName",
        "generalBedPremium", "generalBedNormal",
        "icuAdultBed", "icuPediatricBed", "icuNeonatalBed",
        "deliveryBed", "operatingRoomBed", "erBed", "physicalTherapyBed",
        "psychiatryClosedPremium", "psychiatryClosedNormal",
        "psychiatryOpenPremium", "psychiatryOpenNormal",
        "isolationBed", "sterileRoomBed", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId") DO UPDATE SET
        "foundTypeCode" = EXCLUDED."foundTypeCode",
        "foundTypeName" = EXCLUDED."foundTypeName",
        "generalBedPremium" = EXCLUDED."generalBedPremium",
        "generalBedNormal" = EXCLUDED."generalBedNormal",
        "icuAdultBed" = EXCLUDED."icuAdultBed",
        "icuPediatricBed" = EXCLUDED."icuPediatricBed",
        "icuNeonatalBed" = EXCLUDED."icuNeonatalBed",
        "deliveryBed" = EXCLUDED."deliveryBed",
        "operatingRoomBed" = EXCLUDED."operatingRoomBed",
        "erBed" = EXCLUDED."erBed",
        "physicalTherapyBed" = EXCLUDED."physicalTherapyBed",
        "psychiatryClosedPremium" = EXCLUDED."psychiatryClosedPremium",
        "psychiatryClosedNormal" = EXCLUDED."psychiatryClosedNormal",
        "psychiatryOpenPremium" = EXCLUDED."psychiatryOpenPremium",
        "psychiatryOpenNormal" = EXCLUDED."psychiatryOpenNormal",
        "isolationBed" = EXCLUDED."isolationBed",
        "sterileRoomBed" = EXCLUDED."sterileRoomBed",
        "updatedAt" = NOW()
    `;
  }
}

const DETAIL_COLS = [
  'hospitalId',
  'locationBuilding', 'locationDirection', 'locationDistance',
  'parkingCapacity', 'parkingFee', 'parkingNote',
  'closedSunday', 'closedHoliday',
  'erDayOpen', 'erDayTel1', 'erDayTel2',
  'erNightOpen', 'erNightTel1', 'erNightTel2',
  'lunchWeekday', 'lunchSaturday',
  'receptionWeekday', 'receptionSaturday',
  'openSun', 'closeSun', 'openMon', 'closeMon',
  'openTue', 'closeTue', 'openWed', 'closeWed',
  'openThu', 'closeThu', 'openFri', 'closeFri',
  'openSat', 'closeSat',
] as const;
type DetailCol = typeof DETAIL_COLS[number];

async function writeDetails(rows: NormalizedHospitalDetail[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const cols = DETAIL_COLS.map((c) => `"${c}"`).join(', ');
  const updates = DETAIL_COLS.filter((c) => c !== 'hospitalId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  for (let i = 0; i < mapped.length; i += CHUNK_DETAIL) {
    const chunk = mapped.slice(i, i + CHUNK_DETAIL);
    const values = chunk.map((r) => {
      const cells = DETAIL_COLS.map((c) => Prisma.sql`${(r as Record<string, unknown>)[c] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, NOW())`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "HospitalDetail" (${Prisma.raw(cols)}, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId") DO UPDATE SET ${Prisma.raw(updates)}, "updatedAt" = NOW()
    `);
  }
}

async function writeDepts(rows: NormalizedHospitalDept[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.deptCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.deptCode}, ${r.deptName}, ${r.specialistCount}, ${r.optionalDoctorCount})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalDept" ("hospitalId", "deptCode", "deptName", "specialistCount", "optionalDoctorCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "deptCode") DO UPDATE SET
        "deptName" = EXCLUDED."deptName",
        "specialistCount" = EXCLUDED."specialistCount",
        "optionalDoctorCount" = EXCLUDED."optionalDoctorCount"
    `;
  }
}

async function writeTransits(rows: NormalizedHospitalTransit[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const hospitalIds = [...new Set(mapped.map((r) => r.hospitalId))];
  for (let i = 0; i < hospitalIds.length; i += CHUNK_LARGE) {
    const chunk = hospitalIds.slice(i, i + CHUNK_LARGE);
    await prisma.$executeRaw`DELETE FROM "HospitalTransit" WHERE "hospitalId" = ANY(${chunk})`;
  }
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.transitName}, ${r.routeNumber}, ${r.stopPoint}, ${r.direction}, ${r.distance}, ${r.note}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalTransit" ("hospitalId", "transitName", "routeNumber", "stopPoint", direction, distance, note, "updatedAt")
      VALUES ${Prisma.join(values)}
    `;
  }
}

async function writeEquipment(rows: NormalizedHospitalEquipment[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.equipCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.equipCode}, ${r.equipName}, ${r.equipCount})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalEquipment" ("hospitalId", "equipCode", "equipName", "equipCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "equipCode") DO UPDATE SET
        "equipName" = EXCLUDED."equipName",
        "equipCount" = EXCLUDED."equipCount"
    `;
  }
}

async function writeMealSurcharges(rows: NormalizedHospitalMealSurcharge[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.typeCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.typeCode}, ${r.typeName}, ${r.hasGeneral}, ${r.staffCount}, ${r.treatmentGrade})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalMealSurcharge" ("hospitalId", "typeCode", "typeName", "hasGeneral", "staffCount", "treatmentGrade")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "typeCode") DO UPDATE SET
        "typeName" = EXCLUDED."typeName",
        "hasGeneral" = EXCLUDED."hasGeneral",
        "staffCount" = EXCLUDED."staffCount",
        "treatmentGrade" = EXCLUDED."treatmentGrade"
    `;
  }
}

async function writeNursingGrades(rows: NormalizedHospitalNursingGrade[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.typeCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.typeCode}, ${r.typeName}, ${r.nursingGrade})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalNursingGrade" ("hospitalId", "typeCode", "typeName", "nursingGrade")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "typeCode") DO UPDATE SET
        "typeName" = EXCLUDED."typeName",
        "nursingGrade" = EXCLUDED."nursingGrade"
    `;
  }
}

async function writeSpecialTreatments(rows: NormalizedHospitalSpecialTreatment[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.searchCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.searchCode}, ${r.searchName})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalSpecialTreatment" ("hospitalId", "searchCode", "searchName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "searchCode") DO UPDATE SET "searchName" = EXCLUDED."searchName"
    `;
  }
}

async function writeSpecialties(rows: NormalizedHospitalSpecialty[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.searchCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.searchCode}, ${r.searchName})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalSpecialty" ("hospitalId", "searchCode", "searchName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "searchCode") DO UPDATE SET "searchName" = EXCLUDED."searchName"
    `;
  }
}

async function writeStaff(rows: NormalizedHospitalStaff[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const deduped = [...new Map(mapped.map((r) => [`${r.hospitalId}-${r.staffCode}`, r])).values()];
  for (let i = 0; i < deduped.length; i += CHUNK_LARGE) {
    const chunk = deduped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.staffCode}, ${r.staffName}, ${r.staffCount})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalStaff" ("hospitalId", "staffCode", "staffName", "staffCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "staffCode") DO UPDATE SET
        "staffName" = EXCLUDED."staffName",
        "staffCount" = EXCLUDED."staffCount"
    `;
  }
}

async function main() {
  const { dir } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'amenity-hospital', targetKey: 'all', status: 'RUNNING' },
  });

  try {
    logger.info('hospital: 파일1 파싱 중...');
    const hospitalRows = dedupeBySourceId(parseHospitalRows(readXlsxRows(findXlsx(dir, 1))));
    const upserted = await writeHospitals(hospitalRows);
    logger.info({ upserted }, 'hospital: Hospital upsert 완료');

    const idMap = await buildIdMap(hospitalRows.map((r) => r.sourceId));
    logger.info({ mapped: idMap.size }, 'hospital: idMap 구성 완료');

    logger.info('hospital: 파일3 시설정보 처리 중...');
    await writeFacilities(parseFacilityRows(readXlsxRows(findXlsx(dir, 3))), idMap);

    logger.info('hospital: 파일4 세부정보 처리 중...');
    await writeDetails(parseDetailRows(readXlsxRows(findXlsx(dir, 4))), idMap);

    logger.info('hospital: 파일5 진료과목 처리 중...');
    await writeDepts(parseDeptRows(readXlsxRows(findXlsx(dir, 5))), idMap);

    logger.info('hospital: 파일6 교통정보 처리 중...');
    await writeTransits(parseTransitRows(readXlsxRows(findXlsx(dir, 6))), idMap);

    logger.info('hospital: 파일7 의료장비 처리 중...');
    await writeEquipment(parseEquipmentRows(readXlsxRows(findXlsx(dir, 7))), idMap);

    logger.info('hospital: 파일8 식대가산 처리 중...');
    await writeMealSurcharges(parseMealSurchargeRows(readXlsxRows(findXlsx(dir, 8))), idMap);

    logger.info('hospital: 파일9 간호등급 처리 중...');
    await writeNursingGrades(parseNursingGradeRows(readXlsxRows(findXlsx(dir, 9))), idMap);

    logger.info('hospital: 파일10 특수진료 처리 중...');
    await writeSpecialTreatments(parseSpecialTreatmentRows(readXlsxRows(findXlsx(dir, 10))), idMap);

    logger.info('hospital: 파일11 전문병원 처리 중...');
    await writeSpecialties(parseSpecialtyRows(readXlsxRows(findXlsx(dir, 11))), idMap);

    logger.info('hospital: 파일12 기타인력 처리 중...');
    await writeStaff(parseStaffRows(readXlsxRows(findXlsx(dir, 12))), idMap);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ upserted }, 'hospital ingest 완료');
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
  logger.error({ err }, 'ingest-hospital fatal');
  process.exit(1);
});
