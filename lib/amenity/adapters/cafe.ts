import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';
import { sidoPrefix } from '@/lib/region';
import { AMENITY_PER_PAGE as PER_PAGE, applyStoreNameSearch } from '@/lib/amenity/_shared';

const PREFIX = 'I21201';

export function buildCafeWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { industryCode: { startsWith: PREFIX } };
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
  }
  applyStoreNameSearch(where, f.q);
  return where;
}

function toItem(s: {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string;
  industryCode: string | null;
  industryName: string | null;
  branchName: string | null;
}): AmenityItem {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    sigunguCode: s.sigunguCode,
    industryCode: s.industryCode,
    industryName: s.industryName,
    branchName: s.branchName,
  };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildCafeWhere(f);
  const [rows, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        address: true,
        sigunguCode: true,
        industryCode: true,
        industryName: true,
        branchName: true,
      },
    }),
    prisma.store.count({ where }),
  ]);
  return {
    rows: rows.map(toItem),
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE),
  };
}

async function getById(id: bigint): Promise<AmenityItem | null> {
  const s = await prisma.store.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      sigunguCode: true,
      industryCode: true,
      industryName: true,
      branchName: true,
    },
  });
  return s ? toItem(s) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Store" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where: { industryCode: { startsWith: PREFIX } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export async function cafeRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildCafeWhere(f);
  const groups = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where,
    _count: { _all: true },
  });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}

export const cafeDef: AmenityCategoryDef = {
  slug: 'cafe',
  label: '카페',
  emoji: '☕',
  breadcrumbLabel: '카페',
  getList,
  getRegionBreakdown: cafeRegionBreakdown,
  getById,
  getLatLng,
  inferRowSummary: (row) => row.industryName ?? null,
  detailFields: (item) => [{ label: '업종', value: item.industryName ?? '카페' }],
  getCountsBySigungu,
};
