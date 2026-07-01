import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  AmenityCategoryDef,
  AmenityItem,
  AmenityListFilter,
  AmenityListResult,
} from '@/lib/amenity/category';
import { sidoPrefix } from '@/lib/region';
import { AMENITY_PER_PAGE as PER_PAGE } from '@/lib/amenity/_shared';


type MarketSub = 'all' | 'permanent' | 'periodic' | 'unknown';

export function classifyMarketSub(marketType: string | null): MarketSub {
  const v = (marketType ?? '').trim();
  if (!v) return 'unknown';
  if (v.includes('상설')) return 'permanent';
  if (v.includes('정기') || v.includes('일장')) return 'periodic';
  return 'unknown';
}

function normalizeSub(sub: string | undefined): MarketSub {
  return sub === 'permanent' || sub === 'periodic' ? sub : 'all';
}

export function buildMarketWhere(f: AmenityListFilter): Prisma.TraditionalMarketWhereInput {
  const where: Prisma.TraditionalMarketWhereInput = {};
  if (f.sigunguCode) {
    where.sigunguCode = f.sigunguCode;
  } else if (f.sido) {
    const prefix = sidoPrefix(f.sido);
    if (prefix) where.sigunguCode = { startsWith: prefix };
    else where.sigunguCode = { not: null };
  } else {
    where.sigunguCode = { not: null }; // 시군구 미지정 LIST는 sigunguCode 있는 row만 (DETAIL URL 일관성)
  }
  const sub = normalizeSub(f.sub);
  if (sub === 'permanent') where.marketType = { contains: '상설' };
  else if (sub === 'periodic')
    where.OR = [
      { marketType: { contains: '정기' } },
      { marketType: { contains: '일장' } },
    ];
  if (f.q) where.name = { contains: f.q };
  return where;
}

function toItem(m: {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  marketType: string | null;
}): AmenityItem {
  return {
    id: m.id,
    name: m.name,
    address: m.address,
    sigunguCode: m.sigunguCode,
    marketType: m.marketType,
  };
}

async function getList(f: AmenityListFilter, page: number): Promise<AmenityListResult> {
  const where = buildMarketWhere(f);
  const [rows, total] = await Promise.all([
    prisma.traditionalMarket.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, name: true, address: true, sigunguCode: true, marketType: true },
    }),
    prisma.traditionalMarket.count({ where }),
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
  const m = await prisma.traditionalMarket.findUnique({
    where: { id },
    select: { id: true, name: true, address: true, sigunguCode: true, marketType: true },
  });
  return m ? toItem(m) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "TraditionalMarket" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

async function getCountsBySigungu(): Promise<Map<string, number>> {
  const grouped = await prisma.traditionalMarket.groupBy({
    by: ['sigunguCode'],
    where: { sigunguCode: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export async function marketRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildMarketWhere(f);
  const groups = await prisma.traditionalMarket.groupBy({
    by: ['sigunguCode'],
    where,
    _count: { _all: true },
  });
  return groups
    .filter((g): g is typeof g & { sigunguCode: string } => g.sigunguCode !== null)
    .map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}

function inferRowSummary(row: AmenityItem): string | null {
  const v = (row.marketType ?? '').trim();
  if (!v) return null;
  const hasPermanent = v.includes('상설');
  const periodicMatch = v.match(/\d+일장/);
  const hasPeriodic = periodicMatch !== null || v.includes('정기');
  if (hasPermanent && hasPeriodic) {
    return `상설·${periodicMatch ? periodicMatch[0] : '정기'}`;
  }
  if (hasPermanent) return '상설시장';
  if (periodicMatch) return periodicMatch[0];
  if (hasPeriodic) return '정기시장';
  return v;
}

export const marketDef: AmenityCategoryDef = {
  slug: 'market',
  label: '전통시장',
  emoji: '🏬',
  breadcrumbLabel: '전통시장',
  // 전국 1,400건 규모 — 시도 강제 없이 '전국' 기본 스코프로 페이징.
  requiresSidoScope: false,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: 'permanent', label: '상설' },
      { slug: 'periodic', label: '정기' },
    ],
  },
  getList,
  getRegionBreakdown: marketRegionBreakdown,
  getById,
  getLatLng,
  inferRowSummary,
  detailFields: (item) => [
    { label: '시장 유형', value: item.marketType ?? '-' },
    { label: '분류', value: inferRowSummary(item) ?? '-' },
  ],
  getCountsBySigungu,
};
