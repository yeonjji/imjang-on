/**
 * Seed Region table from data.go.kr 15077871 (행정안전부_행정표준코드_법정동코드).
 * 파일 다운로드 없이 PUBLIC_DATA_KEY만으로 ~50K rows 적재.
 *
 * Usage:
 *   pnpm tsx scripts/ingest/regions/seed-from-api.ts
 *   DATABASE_URL=... pnpm tsx scripts/ingest/regions/seed-from-api.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const BASE = 'https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList';
const PAGE_SIZE = 1000;
const SOURCE_VERSION = process.env.REGION_SOURCE_VERSION ?? new Date().toISOString().slice(0, 7);
const SLEEP_MS = 100;

interface ApiRow {
  region_cd: string;
  sido_cd?: string;
  sgg_cd?: string;
  umd_cd?: string;
  ri_cd?: string;
  locatadd_nm: string;
}

interface ApiResponseHead {
  totalCount?: string | number;
  numOfRows?: string | number;
  pageNo?: string | number;
  type?: string;
}

interface ApiResponseChunk {
  head?: ApiResponseHead[];
  row?: ApiRow[];
}

interface ApiResponse {
  StanReginCd?: ApiResponseChunk[];
}

async function fetchPage(pageNo: number): Promise<{ rows: ApiRow[]; totalCount: number }> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  url.searchParams.set('type', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as ApiResponse;
  const chunks = data.StanReginCd ?? [];
  const head = chunks[0]?.head ?? [];
  const rows = chunks[1]?.row ?? [];

  const totalCountEntry = head.find((h) => h.totalCount !== undefined);
  const totalCount = totalCountEntry ? Number(totalCountEntry.totalCount) : 0;

  return { rows, totalCount };
}

function deriveLevelAndParent(
  code: string,
  fullName: string,
): { level: number; parentCode: string | null } {
  const parts = fullName.trim().split(/\s+/);
  const level = Math.min(Math.max(parts.length, 1), 4);
  let parentCode: string | null = null;
  if (level === 2) parentCode = code.slice(0, 2).padEnd(10, '0');
  else if (level === 3) parentCode = code.slice(0, 5).padEnd(10, '0');
  else if (level === 4) parentCode = code.slice(0, 8).padEnd(10, '0');
  return { level, parentCode };
}

async function main() {
  logger.info({ version: SOURCE_VERSION }, 'seeding regions from API');

  let pageNo = 1;
  let totalSeen = 0;
  let totalCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows, totalCount: tc } = await fetchPage(pageNo);
    if (pageNo === 1) totalCount = tc;
    if (rows.length === 0) break;

    const records = rows
      .filter((r) => r.region_cd && r.locatadd_nm)
      .map((r) => {
        const fullName = r.locatadd_nm.trim();
        const parts = fullName.split(/\s+/);
        const { level } = deriveLevelAndParent(r.region_cd, fullName);
        return {
          code: r.region_cd,
          sido: parts[0] ?? '',
          sigungu: parts[1] ?? null,
          eupmyeondong: parts[2] ?? null,
          ri: parts[3] ?? null,
          fullName,
          level,
          // parentCode는 2차 패스에서 채움 (FK 충돌 회피)
          parentCode: null,
          isAbolished: false,
          sourceVersion: SOURCE_VERSION,
        };
      });

    await prisma.$transaction(
      records.map((rec) =>
        prisma.region.upsert({
          where: { code: rec.code },
          create: rec,
          update: rec,
        }),
      ),
    );

    totalSeen += records.length;
    logger.info({ pageNo, totalSeen, totalCount }, 'page done');

    if (totalSeen >= totalCount || rows.length < PAGE_SIZE) break;
    pageNo++;
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  // 2차 패스: parentCode 채우기 (모든 row가 존재한 상태에서 안전)
  logger.info('linking parent codes...');
  await prisma.$executeRaw`
    UPDATE "Region" r
    SET "parentCode" = CASE
      WHEN level = 2 THEN LPAD(LEFT(code, 2), 10, '0')
      WHEN level = 3 THEN LPAD(LEFT(code, 5), 10, '0')
      WHEN level = 4 THEN LPAD(LEFT(code, 8), 10, '0')
      ELSE NULL
    END
    WHERE level >= 2
      AND EXISTS (
        SELECT 1 FROM "Region" p WHERE p.code = CASE
          WHEN r.level = 2 THEN LPAD(LEFT(r.code, 2), 10, '0')
          WHEN r.level = 3 THEN LPAD(LEFT(r.code, 5), 10, '0')
          WHEN r.level = 4 THEN LPAD(LEFT(r.code, 8), 10, '0')
        END
      )
  `;

  await prisma.$disconnect();
  logger.info({ totalSeen }, 'region seed done');
}

main().catch((err) => {
  logger.error({ err }, 'region API seed failed');
  process.exit(1);
});
