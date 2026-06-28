import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import type { Prisma, Property, Region } from '@prisma/client';
import { normalizeName } from '@/lib/slug';
import { sidoFullName } from '@/lib/region';

/**
 * 매물 색인 임곗값. 최근 12개월 거래가 이 값 미만이면 고유 데이터가 빈약(thin)하여
 * 색인에서 제외한다 — 사이트맵 게이트와 상세 페이지 noindex가 이 상수를 공유한다.
 * docs/adsense/thin-content-diagnosis.md 참고.
 */
export const MIN_INDEXABLE_TX = 3;

export type PropertyTypeSlug = 'apt' | 'officetel' | 'villa';

export function slugToType(slug: PropertyTypeSlug): PropertyType[] {
  if (slug === 'apt') return [PropertyType.APARTMENT];
  if (slug === 'officetel') return [PropertyType.OFFICETEL];
  return [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX];
}

export function typeToSlug(t: PropertyType): PropertyTypeSlug {
  if (t === PropertyType.APARTMENT) return 'apt';
  if (t === PropertyType.OFFICETEL) return 'officetel';
  return 'villa';
}

export async function getPropertyById(id: bigint) {
  return prisma.property.findUnique({
    where: { id },
    include: { region: true },
  });
}

export type DealFilter = 'all' | 'sale' | 'jeonse' | 'wolse';
export type AreaRange = 'small' | 'medium' | 'large' | 'xlarge';
export type SortOption = 'recent' | 'volume' | 'price_desc' | 'price_asc';

export interface PropertyListParams {
  types: PropertyType[];
  deal?: DealFilter;
  priceMin?: number;  // 만원 단위
  priceMax?: number;  // 만원 단위
  areaRange?: AreaRange;
  sort?: SortOption;
  sigunguCode?: string;
  sido?: string;
  q?: string;
  page?: number;
  perPage?: number;
  stationId?: string;
}

export function buildPriceCondition(
  priceMin: number | undefined,
  priceMax: number | undefined,
): Prisma.BigIntFilter | undefined {
  if (priceMin === undefined && priceMax === undefined) return undefined;
  // 비교 대상 컬럼(saleAvgPrice12m 등)이 만원 단위로 저장되므로, 만원 단위인
  // priceMin/priceMax를 그대로 비교한다(원 단위 환산 금지 — 그러면 임계값이 1만배 부풀려져
  // min은 전부 탈락(빈 리스트), max는 상한이 사라져 필터가 무력화된다).
  const cond: Prisma.BigIntFilter = {};
  if (priceMin !== undefined && priceMin > 0) {
    cond.gte = BigInt(priceMin);
  }
  if (priceMax !== undefined) {
    cond.lte = BigInt(priceMax);
  }
  return cond;
}

export function buildKeywordCondition(
  q: string | undefined,
): Prisma.PropertyWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  return {
    OR: [
      { nameNorm: { contains: normalizeName(term) } },
      { region: { is: { fullName: { contains: term } } } },
    ],
  };
}

function rangeArray(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export async function getPropertyList({
  types,
  deal = 'all',
  priceMin,
  priceMax,
  areaRange,
  sort = 'recent',
  sigunguCode,
  sido,
  q,
  page = 1,
  perPage = 30,
  stationId,
}: PropertyListParams) {
  const where: Prisma.PropertyWhereInput = { propertyType: { in: types } };

  if (stationId) {
    const ids = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT p.id
      FROM "Property" p, "SubwayStation" s
      WHERE s.id = ${BigInt(stationId)}
        AND p.location IS NOT NULL
        AND ST_DWithin(p.location, s.location, 800)
      LIMIT 3000
    `;
    if (ids.length === 0) {
      return { rows: [], total: 0, page, perPage, totalPages: 0 };
    }
    where.id = { in: ids.map((r) => r.id) };
  }

  // deal → count filter
  if (deal === 'sale') {
    where.saleCount12m = { gt: 0 };
  } else if (deal === 'jeonse') {
    where.jeonseCount12m = { gt: 0 };
  } else if (deal === 'wolse') {
    where.wolseCount12m = { gt: 0 };
  } else {
    where.txCount12m = { gt: 0 };
  }

  if (sigunguCode) {
    where.sigunguCode = sigunguCode;
  } else if (sido) {
    // Region.sido는 fullName("서울특별시")으로 저장되므로 단축명("서울")을 변환해 비교한다.
    where.region = { sido: sidoFullName(sido) };
  }

  const priceCond = buildPriceCondition(priceMin, priceMax);
  if (priceCond) {
    if (deal === 'jeonse') {
      where.jeonseAvgDeposit12m = priceCond;
    } else if (deal === 'wolse') {
      where.wolseAvgDeposit12m = priceCond;
    } else if (deal === 'sale') {
      where.saleAvgPrice12m = priceCond;
    } else {
      where.OR = [
        { saleAvgPrice12m: priceCond },
        { jeonseAvgDeposit12m: priceCond },
        { wolseAvgDeposit12m: priceCond },
      ];
    }
  }

  // areaRange → areaTypes filter
  if (areaRange) {
    const areas =
      areaRange === 'small'
        ? rangeArray(1, 18)
        : areaRange === 'medium'
          ? rangeArray(18, 26)
          : areaRange === 'large'
            ? rangeArray(26, 35)
            : rangeArray(35, 100);
    where.areaTypes = { hasSome: areas };
  }

  const keywordCond = buildKeywordCondition(q);
  if (keywordCond) {
    where.AND = [keywordCond];
  }

  // deal + sort → orderBy
  let orderBy: Prisma.PropertyOrderByWithRelationInput;

  if (sort === 'price_desc' || sort === 'price_asc') {
    const direction = sort === 'price_desc' ? ('desc' as const) : ('asc' as const);
    if (deal === 'jeonse') {
      orderBy = { jeonseLastDeposit: { sort: direction, nulls: 'last' } };
    } else if (deal === 'wolse') {
      orderBy = { wolseLastDeposit: { sort: direction, nulls: 'last' } };
    } else {
      orderBy = { saleLastPrice: { sort: direction, nulls: 'last' } };
    }
  } else if (deal === 'sale') {
    orderBy = sort === 'volume' ? { saleCount12m: 'desc' } : { saleLastAt: 'desc' };
  } else if (deal === 'jeonse') {
    orderBy = sort === 'volume' ? { jeonseCount12m: 'desc' } : { jeonseLastAt: 'desc' };
  } else if (deal === 'wolse') {
    orderBy = sort === 'volume' ? { wolseCount12m: 'desc' } : { wolseLastAt: 'desc' };
  } else {
    orderBy = sort === 'volume' ? { txCount12m: 'desc' } : { lastTxAt: 'desc' };
  }

  // 정확 카운트는 충분히 좁은 필터(지역·역·키워드)에서만. 광역/기본 조회는
  // 10만+ 행 카운트가 비싸므로 1,000건에서 캡(이상이면 "1,000+" 표시).
  const COUNT_CAP = 1000;
  const narrowCount = Boolean(sigunguCode || stationId || q);

  const [rows, rawTotal] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { region: true },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    narrowCount
      ? prisma.property.count({ where })
      : prisma.property
          .findMany({ where, select: { id: true }, take: COUNT_CAP + 1 })
          .then((r) => r.length),
  ]);

  const totalCapped = !narrowCount && rawTotal > COUNT_CAP;
  return {
    rows,
    total: rawTotal,
    totalCapped,
    page,
    perPage,
    totalPages: Math.ceil(rawTotal / perPage),
  };
}

export async function getTopPropertiesByVolume({ types, sigunguCode, sidoPrefixes, limit = 10 }: { types: PropertyType[]; sigunguCode?: string; sidoPrefixes?: string[]; limit?: number }) {
  return prisma.property.findMany({
    where: {
      propertyType: { in: types },
      txCount12m: { gt: 0 },
      ...(sigunguCode ? { sigunguCode } : {}),
      ...(sidoPrefixes && sidoPrefixes.length > 0
        ? { OR: sidoPrefixes.map((p) => ({ sigunguCode: { startsWith: p } })) }
        : {}),
    },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: limit,
  });
}

export async function getPropertyLatLng(
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Property" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface PropertyListItem {
  id: string;
  propertyType: PropertyType;
  name: string;
  builtYear: number | null;
  households: number | null;
  txCount12m: number;
  saleCount12m: number;
  saleLastPrice: number | null;
  saleAvgPrice12m: number | null;
  jeonseCount12m: number;
  jeonseLastDeposit: number | null;
  jeonseAvgDeposit12m: number | null;
  wolseCount12m: number;
  wolseLastDeposit: number | null;
  wolseLastRent: number | null;
  region: { fullName: string };
}

const toNum = (v: bigint | number | null): number | null => (v == null ? null : Number(v));

export function serializeProperty(p: Property & { region: Region }): PropertyListItem {
  return {
    id: p.id.toString(),
    propertyType: p.propertyType,
    name: p.name,
    builtYear: p.builtYear,
    households: p.households,
    txCount12m: p.txCount12m,
    saleCount12m: p.saleCount12m,
    saleLastPrice: toNum(p.saleLastPrice),
    saleAvgPrice12m: toNum(p.saleAvgPrice12m),
    jeonseCount12m: p.jeonseCount12m,
    jeonseLastDeposit: toNum(p.jeonseLastDeposit),
    jeonseAvgDeposit12m: toNum(p.jeonseAvgDeposit12m),
    wolseCount12m: p.wolseCount12m,
    wolseLastDeposit: toNum(p.wolseLastDeposit),
    wolseLastRent: p.wolseLastRent,
    region: { fullName: p.region.fullName },
  };
}

export type FeedEntry<T> = { type: 'item'; item: T } | { type: 'ad'; key: string };

export function withAdSlots<T>(items: T[], interval: number): FeedEntry<T>[] {
  const out: FeedEntry<T>[] = [];
  items.forEach((item, i) => {
    out.push({ type: 'item', item });
    if ((i + 1) % interval === 0) out.push({ type: 'ad', key: `ad-${i + 1}` });
  });
  return out;
}

export interface RegionStats {
  complexCount: number;
  txCount12m: number;
  saleAvgPrice12m: number | null;   // 만원
  jeonseAvgDeposit12m: number | null; // 만원
  priceMin: number | null;
  priceMax: number | null;
}

/** 시군구 단위 아파트 집계(거래 있는 단지 대상). raw SQL로 BigInt 평균 안전 처리. */
export async function getRegionStats(sigunguCode: string): Promise<RegionStats> {
  const rows = await prisma.$queryRaw<Array<{
    complex_count: number;
    tx_count: number;
    sale_avg: number | null;
    jeonse_avg: number | null;
    sale_min: number | null;
    sale_max: number | null;
  }>>`
    SELECT
      COUNT(*)::int AS complex_count,
      COALESCE(SUM("txCount12m"), 0)::int AS tx_count,
      AVG("saleAvgPrice12m")::float AS sale_avg,
      AVG("jeonseAvgDeposit12m")::float AS jeonse_avg,
      MIN("saleAvgPrice12m")::float AS sale_min,
      MAX("saleAvgPrice12m")::float AS sale_max
    FROM "Property"
    WHERE "sigunguCode" = ${sigunguCode}
      AND "propertyType" = 'APARTMENT'
      AND "txCount12m" > 0
  `;
  const r = rows[0];
  return {
    complexCount: r?.complex_count ?? 0,
    txCount12m: r?.tx_count ?? 0,
    saleAvgPrice12m: r?.sale_avg != null ? Math.round(r.sale_avg) : null,
    jeonseAvgDeposit12m: r?.jeonse_avg != null ? Math.round(r.jeonse_avg) : null,
    priceMin: r?.sale_min != null ? Math.round(r.sale_min) : null,
    priceMax: r?.sale_max != null ? Math.round(r.sale_max) : null,
  };
}
