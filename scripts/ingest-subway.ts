import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { clusterStations, type RawStationRow } from '@/scripts/ingest/subway/cluster';

// 국가철도공단 레일포털 "도시철도역사 정보" 표준데이터 파일 다운로드(GET, 세션 불필요, 연 1회 갱신)
const DOWNLOAD_URL =
  'https://data.kric.go.kr/rips/dataset/download.file?type=filedata&id=32&operation=1';
const CHUNK = 500;

function parseArgs(): { file: string | null } {
  const args = process.argv.slice(2);
  // --file= 명시 시 로컬 파일, 없으면 레일포털에서 다운로드
  const file = args.find((a) => a.startsWith('--file='))?.split('=')[1] ?? null;
  return { file };
}

/** --file 없으면 레일포털에서 최신 xlsx 다운로드 → 임시파일 경로 반환(temp=true). */
async function resolveFile(fileArg: string | null): Promise<{ path: string; temp: boolean }> {
  if (fileArg) return { path: fileArg, temp: false };
  logger.info({ url: DOWNLOAD_URL }, 'subway: 레일포털에서 원본 다운로드 중...');
  const res = await fetch(DOWNLOAD_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (imjang-on subway ingest)' },
  });
  if (!res.ok) throw new Error(`subway download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // xlsx = ZIP이라 PK(0x50 0x4b) 시그니처. 에러 HTML 페이지가 오면 방어.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`subway download가 xlsx가 아님(PK 시그니처 없음, ${buf.length} bytes)`);
  }
  const tmp = path.join(os.tmpdir(), `subway-${process.pid}-${Date.now()}.xlsx`);
  await writeFile(tmp, buf);
  logger.info({ tmp, bytes: buf.length }, 'subway: 다운로드 완료');
  return { path: tmp, temp: true };
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
  const { file: fileArg } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'subway', targetKey: 'stations', status: 'RUNNING' },
  });
  let temp: string | null = null;
  try {
    const src = await resolveFile(fileArg);
    temp = src.temp ? src.path : null;
    logger.info({ file: src.path }, 'subway: xlsx 파싱 중...');
    const raw = toRawRows(readXlsxRows(src.path));
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
    if (temp) await unlink(temp).catch(() => {});
  }
}

main().catch((err) => {
  logger.error({ err }, 'ingest-subway fatal');
  process.exit(1);
});
