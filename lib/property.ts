import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

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
  page?: number;
  perPage?: number;
}

export function buildPriceCondition(
  priceMin: number | undefined,
  priceMax: number | undefined,
): Prisma.BigIntFilter | undefined {
  if (priceMin === undefined && priceMax === undefined) return undefined;
  const cond: Prisma.BigIntFilter = {};
  if (priceMin !== undefined && priceMin > 0) {
    cond.gte = BigInt(priceMin) * BigInt(10_000);
  }
  if (priceMax !== undefined) {
    cond.lte = BigInt(priceMax) * BigInt(10_000);
  }
  return cond;
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
  page = 1,
  perPage = 30,
}: PropertyListParams) {
  const where: Prisma.PropertyWhereInput = { propertyType: { in: types } };

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
    where.region = { sido };
  }

  const priceCond = buildPriceCondition(priceMin, priceMax);
  if (priceCond) {
    if (deal === 'jeonse') {
      where.jeonseAvgDeposit12m = priceCond;
    } else if (deal === 'wolse') {
      where.wolseAvgDeposit12m = priceCond;
    } else {
      where.saleAvgPrice12m = priceCond;
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

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { region: true },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.property.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getTopPropertiesByVolume({ types, sigunguCode, limit = 10 }: { types: PropertyType[]; sigunguCode?: string; limit?: number }) {
  return prisma.property.findMany({
    where: {
      propertyType: { in: types },
      txCount12m: { gt: 0 },
      ...(sigunguCode ? { sigunguCode } : {}),
    },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: limit,
  });
}
