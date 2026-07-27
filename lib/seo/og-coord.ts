// og:image에 쓸 지도의 중심 좌표를 정한다.
// 정확한 좌표 → 같은 읍면동 매물들의 centroid → 같은 시군구 centroid → 포기.
// 폴백 좌표는 og:image 전용이다. JSON-LD image와 본문 지도에는 쓰지 않는다.
import { Prisma } from '@prisma/client';
import type { PropertyType } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { getPropertyLatLng } from '@/lib/property';

export type OgMapTarget =
  | { kind: 'precise'; lat: number; lng: number; level: 16; marker: true }
  | { kind: 'region'; lat: number; lng: number; level: 13 | 11; marker: false };

// 한반도 bbox. (0,0)이나 lat/lng가 뒤바뀐 값 같은 총체적 오염을 집계 전에 거른다.
const KR = { latMin: 33.0, latMax: 38.7, lngMin: 124.5, lngMax: 132.0 } as const;

const DONG = { minSamples: 5, maxSpreadM: 20_000, level: 13 } as const;
const SIGUNGU = { minSamples: 20, maxSpreadM: 150_000, level: 11 } as const;

// OG 이미지 하나 때문에 페이지가 느려지면 안 된다. DB측에서 실제로 중단시킨다.
const CENTROID_TIMEOUT_MS = 800;

interface CentroidRow {
  n: number | null;
  lat: number | null;
  lng: number | null;
  spread_m: number | null;
}

async function runCentroidQuery(
  propertyType: PropertyType,
  where: Prisma.Sql,
): Promise<CentroidRow | null> {
  const [, rows] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${CENTROID_TIMEOUT_MS}`),
    prisma.$queryRaw<CentroidRow[]>`
      WITH pts AS (
        SELECT location::geometry AS g
        FROM "Property"
        WHERE "propertyType" = ${propertyType}::"PropertyType"
          AND ${where}
          AND location IS NOT NULL
          AND ST_Y(location::geometry) BETWEEN ${KR.latMin} AND ${KR.latMax}
          AND ST_X(location::geometry) BETWEEN ${KR.lngMin} AND ${KR.lngMax}
      ),
      agg AS (SELECT ST_Collect(g) AS c, count(*)::int AS n FROM pts)
      SELECT
        n,
        ST_Y(ST_Centroid(c)) AS lat,
        ST_X(ST_Centroid(c)) AS lng,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(ST_XMin(c), ST_YMin(c)), 4326)::geography,
          ST_SetSRID(ST_MakePoint(ST_XMax(c), ST_YMax(c)), 4326)::geography
        ) AS spread_m
      FROM agg
      WHERE n > 0
    `,
  ]);
  return rows[0] ?? null;
}

/**
 * 유효 점이 0개면 ST_Collect가 NULL을 반환한다. `WHERE n > 0`가 그 행을 거르지만
 * Postgres가 SELECT 목록을 먼저 평가하지 않는다는 보장이 없어 여기서도 확인한다.
 */
function accept(
  row: CentroidRow | null,
  gate: { minSamples: number; maxSpreadM: number },
): { lat: number; lng: number } | null {
  if (!row || row.n === null || row.lat === null || row.lng === null) return null;
  if (row.n < gate.minSamples) return null;
  if (row.spread_m !== null && row.spread_m > gate.maxSpreadM) return null;
  return { lat: row.lat, lng: row.lng };
}

async function safeCentroid(
  propertyType: PropertyType,
  where: Prisma.Sql,
  gate: { minSamples: number; maxSpreadM: number },
): Promise<{ lat: number; lng: number } | null> {
  try {
    return accept(await runCentroidQuery(propertyType, where), gate);
  } catch {
    // 타임아웃이든 다른 예외든 og:image를 포기할 뿐, 페이지 렌더에 영향을 주지 않는다.
    return null;
  }
}

// 같은 읍면동의 좌표 없는 매물이 여러 건이어도 스코프당 하루 1회만 조회한다.
// null 결과도 함께 캐시해 실패 스코프를 반복 조회하지 않는다.
function dongCentroid(propertyType: PropertyType, regionCode: string) {
  return unstable_cache(
    () => safeCentroid(propertyType, Prisma.sql`"regionCode" = ${regionCode}`, DONG),
    ['og-centroid', 'dong', propertyType, regionCode],
    { revalidate: 86_400 },
  )();
}

// sigunguCode에는 인덱스가 없다. 시군구 5자리는 regionCode의 접두사라
// LIKE prefix range로 기존 @@index([propertyType, regionCode])에 그대로 얹힌다.
function sigunguCentroid(propertyType: PropertyType, sigunguCode: string) {
  return unstable_cache(
    () => safeCentroid(propertyType, Prisma.sql`"regionCode" LIKE ${`${sigunguCode}%`}`, SIGUNGU),
    ['og-centroid', 'sigungu', propertyType, sigunguCode],
    { revalidate: 86_400 },
  )();
}

export async function resolveOgMapTarget(propertyId: bigint): Promise<OgMapTarget | null> {
  const precise = await getPropertyLatLng(propertyId).catch(() => null);
  if (precise) return { kind: 'precise', lat: precise.lat, lng: precise.lng, level: 16, marker: true };

  const p = await prisma.property
    .findUnique({
      where: { id: propertyId },
      select: { propertyType: true, regionCode: true, sigunguCode: true },
    })
    .catch(() => null);
  if (!p) return null;

  const dong = await dongCentroid(p.propertyType, p.regionCode);
  if (dong) return { kind: 'region', lat: dong.lat, lng: dong.lng, level: DONG.level, marker: false };

  if (p.sigunguCode) {
    const sgg = await sigunguCentroid(p.propertyType, p.sigunguCode);
    if (sgg) return { kind: 'region', lat: sgg.lat, lng: sgg.lng, level: SIGUNGU.level, marker: false };
  }

  return null;
}
