// og:image에 쓸 지도의 중심 좌표를 정한다.
// 정확한 좌표 → 같은 읍면동 매물들의 centroid → 같은 시군구 centroid → 포기.
// 폴백 좌표는 og:image 전용이다. JSON-LD image와 본문 지도에는 쓰지 않는다.
import { Prisma } from '@prisma/client';
import type { PropertyType } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { getMapEntityLatLng } from '@/lib/seo/map-entity';

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
// unstable_cache 래퍼 자체가 던질 수 있어(캐시 컨텍스트 이상 등) safeCentroid의
// try/catch만으로는 부족하다 — 호출 전체를 감싸 어떤 실패든 og:image만 포기시킨다.
async function dongCentroid(propertyType: PropertyType, regionCode: string) {
  try {
    return await unstable_cache(
      () => safeCentroid(propertyType, Prisma.sql`"regionCode" = ${regionCode}`, DONG),
      ['og-centroid', 'dong', propertyType, regionCode],
      { revalidate: 86_400 },
    )();
  } catch {
    return null;
  }
}

// sigunguCode는 generated column(LEFT(regionCode,5))이라 schema.prisma엔 안 보이지만
// DB엔 Property_sigunguCode_idx / Property_type_sgg_lasttx_idx가 이미 있다. 이전엔
// "regionCode LIKE prefix%"가 그 인덱스를 탄다고 적었지만 틀렸다 — LIKE prefix 매칭은
// 기본 collation btree 인덱스를 못 타 프로덕션 EXPLAIN ANALYZE에서 Parallel Seq Scan으로
// 떨어졌다(275,573행 중 송파구 MULTIPLEX 6,704건 스코프, 262ms). "sigunguCode = ?"는
// 같은 스코프에서 동일한 6,704건을 Property_type_sgg_lasttx_idx의 Bitmap Index Scan으로
// 16ms에 반환한다(둘은 sigunguCode가 정확히 LEFT(regionCode,5)라 결과가 항상 같다).
async function sigunguCentroid(propertyType: PropertyType, sigunguCode: string) {
  try {
    return await unstable_cache(
      () => safeCentroid(propertyType, Prisma.sql`"sigunguCode" = ${sigunguCode}`, SIGUNGU),
      ['og-centroid', 'sigungu', propertyType, sigunguCode],
      { revalidate: 86_400 },
    )();
  } catch {
    return null;
  }
}

export async function resolveOgMapTarget(propertyId: bigint): Promise<OgMapTarget | null> {
  const precise = await getMapEntityLatLng('property', propertyId).catch(() => null);
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
