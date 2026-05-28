import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';

const PER_PAGE = 30;
const PREFIX_SUPER = 'G20404';
const PREFIX_HYPER = 'G20402';

type MartSub = 'all' | 'super' | 'hyper';

function normalizeSub(sub: string | undefined): MartSub {
  return sub === 'super' || sub === 'hyper' ? sub : 'all';
}

export function buildMartWhere(f: AmenityListFilter): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  const sub = normalizeSub(f.sub);
  if (sub === 'super') where.industryCode = { startsWith: PREFIX_SUPER };
  else if (sub === 'hyper') where.industryCode = { startsWith: PREFIX_HYPER };
  else
    where.OR = [
      { industryCode: { startsWith: PREFIX_SUPER } },
      { industryCode: { startsWith: PREFIX_HYPER } },
    ];
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(s: {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string;
  industryCode: string | null;
  industryName: string | null;
}): AmenityItem {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    sigunguCode: s.sigunguCode,
    industryCode: s.industryCode,
    industryName: s.industryName,
  };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildMartWhere(f);
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
    where: {
      OR: [
        { industryCode: { startsWith: PREFIX_SUPER } },
        { industryCode: { startsWith: PREFIX_HYPER } },
      ],
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

function inferRowSummary(row: AmenityItem): string | null {
  const c = row.industryCode ?? '';
  if (c.startsWith(PREFIX_HYPER)) return '대형마트';
  if (c.startsWith(PREFIX_SUPER)) return '슈퍼마켓';
  return row.industryName ?? null;
}

export const martDef: AmenityCategoryDef = {
  slug: 'mart',
  label: '마트',
  emoji: '🛒',
  breadcrumbLabel: '마트',
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: 'super', label: '슈퍼마켓' },
      { slug: 'hyper', label: '대형마트' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary,
  detailFields: (item) => [
    { label: '구분', value: inferRowSummary(item) ?? '마트' },
    { label: '업종', value: item.industryName ?? '-' },
  ],
  getCountsBySigungu,
};
