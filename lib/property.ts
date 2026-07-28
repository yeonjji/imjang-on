import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import type { Prisma, Property, Region } from '@prisma/client';
import { normalizeName } from '@/lib/slug';
import { sidoFullName } from '@/lib/region';

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

/** 지번 토큰 판정. 접두가 아니라 전체 토큰이 매치해야 한다. */
const JIBUN_PATTERN = /^(?:산)?\d+(?:-\d+)?$/;

export interface PropertyAddress {
  /** 법정동(읍·면·리 포함). 지번이 없어도 이것은 정확한 정보다 */
  locality: string | null;
  /** 지번. 엄격 패턴을 통과했을 때만 채워진다 */
  jibun: string | null;
  /** 정확한 지번주소(locality + jibun). 둘 중 하나라도 없으면 null */
  street: string | null;
  /** 화면 표시용 최선의 문자열. street → locality → 시군구 순으로 낮아진다 */
  display: string;
  /** display에서 지번을 뺀 것. 지번이 확정되지 않았을 때 쓴다 */
  localityDisplay: string;
}

/**
 * Region.fullName이 법정동으로 끝나면(세종 등 시드 레벨 오분류) 그 꼬리를 떼어낸다.
 * 안 떼면 "세종특별자치시 용호동" + "산울동 가-" → 서로 모순되는 법정동 두 개가 한 줄에 들어간다.
 * 시군구는 구/시/군으로 끝나므로 이 검사에 걸리지 않는다.
 */
function regionPrefix(fullName: string, locality: string | null): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (
    tokens.length >= 2 &&
    last !== undefined &&
    /(?:동|읍|면|리)$/.test(last) &&
    locality !== null &&
    locality !== last
  ) {
    return tokens.slice(0, -1).join(' ');
  }
  return fullName;
}

/**
 * Property.address("법정동 지번")를 파싱해 정확한 지번주소와 법정동 폴백을 분리한다.
 * buildAddress()가 umd + jibun 순으로 조립하므로 마지막 토큰이 항상 지번 자리다.
 * 이 전제는 roadName이 현재 전 행 null이라는 데이터 상태에 기댄다 — 설계 §7.1의 roadnm
 * 필드명 수정으로 도로명이 채워지기 시작하면 이 파서도 함께 손봐야 한다.
 */
export function propertyAddress(
  property: { address: string },
  region: { fullName: string },
): PropertyAddress {
  const tokens = property.address.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  const lastIsJibun = last !== undefined && JIBUN_PATTERN.test(last);

  let locality: string | null = null;
  let jibun: string | null = null;

  if (tokens.length >= 2) {
    // 법정동 없는 맨 숫자를 주소로 승격하지 않기 위해 토큰 2개 이상일 때만 지번을 인정한다.
    locality = tokens.slice(0, -1).join(' ');
    if (lastIsJibun) jibun = last;
  } else if (tokens.length === 1 && !lastIsJibun) {
    locality = tokens[0];
  }

  const street = locality && jibun ? `${locality} ${jibun}` : null;
  const tail = street ?? locality;
  const prefix = regionPrefix(region.fullName, locality);
  return {
    locality,
    jibun,
    street,
    display: tail ? `${prefix} ${tail}` : prefix,
    localityDisplay: locality ? `${prefix} ${locality}` : prefix,
  };
}

/**
 * meta description에 넣을 지역 문자열.
 * 지번이 확정되지 않았으면 지번주소를 쓰지 않고 시군구로 낮춘다.
 */
export function metaRegionName(
  addr: PropertyAddress,
  region: { fullName: string },
  confirmed: boolean,
): string {
  return confirmed ? addr.display : region.fullName;
}

export async function getPropertyById(id: bigint) {
  return prisma.property.findUnique({
    where: { id },
    include: { region: true },
  });
}

/**
 * 이 단지의 거래가 단일 지번주소에 모여 있는지.
 * false면 Property.address는 여러 지번 중 하나일 뿐이므로 '대표 지번'으로만 다뤄야 한다.
 * (동명 단지가 이름만으로 병합되는 문제 — 전체 단지의 3.9%)
 *
 * 세는 단위는 buildAddress()의 조립 단위인 (법정동, 지번) 쌍이다. jibun만 세면 서로 다른
 * 법정동의 같은 번지수로 병합된 단지가 통과한다.
 * `jibun IS NOT NULL`은 필수다 — 복합 COUNT(DISTINCT (a,b))는 스칼라와 달리 NULL을 포함한
 * 행도 값으로 세므로, 필터가 없으면 지번이 전부 NULL인 단지가 1이 되어 통과한다.
 *
 * Transaction_propertyId_contractDate_idx 인덱스 스캔. 최다 거래 단지 기준 22.9ms.
 */
export async function hasSingleJibun(propertyId: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT (umd, jibun)) AS n
    FROM "Transaction"
    WHERE "propertyId" = ${propertyId} AND jibun IS NOT NULL
  `;
  return Number(rows[0]?.n ?? 0) === 1;
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
  areaTypes: number[];
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
    areaTypes: p.areaTypes,
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

/** 시군구 단위 매물유형별 집계(거래 있는 단지 대상). raw SQL로 BigInt 평균 안전 처리. */
export async function getRegionStats(
  sigunguCode: string,
  propertyType: PropertyType = PropertyType.APARTMENT,
): Promise<RegionStats> {
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
      AND "propertyType"::text = ${propertyType}
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
