import type { Park, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { UrbanCategoryDef, UrbanItem, UrbanListFilter, UrbanListResult } from '@/lib/urban/category';
import { fullSidoName, resolveAddrPrefix, URBAN_PER_PAGE as PER_PAGE } from '@/lib/urban/_shared';

export type ParkRaw = Park;

export const PARK_TYPE_EMOJI: Record<string, string> = {
  근린공원: '🌳',
  어린이공원: '🌿',
  체육공원: '🏃',
  역사공원: '🏛️',
  소공원: '🌳',
};

export function formatParkArea(area: number | null | undefined): string | null {
  if (!area) return null;
  return `${area.toLocaleString('ko-KR')} ㎡`;
}

function buildWhere(f: UrbanListFilter, addrPrefix: string | null): Prisma.ParkWhereInput {
  const conditions: Prisma.ParkWhereInput[] = [];
  if (addrPrefix) {
    conditions.push({ address: { startsWith: addrPrefix } });
  } else if (f.sido) {
    conditions.push({ address: { startsWith: fullSidoName(f.sido) } });
  }
  if (f.sub && f.sub !== 'all') {
    conditions.push({ parkType: { contains: f.sub } });
  }
  if (f.q) {
    conditions.push({ name: { contains: f.q } });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

function toItem(row: ParkRaw): UrbanItem<ParkRaw> {
  return { id: row.id, name: row.name, address: row.address, sigunguCode: null, raw: row };
}

async function getList(f: UrbanListFilter, page: number): Promise<UrbanListResult<ParkRaw>> {
  const addrPrefix = await resolveAddrPrefix(f);
  if (addrPrefix === '__NO_MATCH__') {
    return { rows: [], total: 0, page, perPage: PER_PAGE, totalPages: 0 };
  }
  const where = buildWhere(f, addrPrefix);
  const [rows, total] = await Promise.all([
    prisma.park.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.park.count({ where }),
  ]);
  return { rows: rows.map(toItem), total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

async function getById(id: bigint): Promise<UrbanItem<ParkRaw> | null> {
  const row = await prisma.park.findUnique({ where: { id } });
  return row ? toItem(row) : null;
}

async function getRegionBreakdown(_f: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  return []; // Park 모델은 sigunguCode 컬럼 미보유(주소 파싱 기반) → 분포 생략
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Park" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export const parkDef: UrbanCategoryDef<ParkRaw> = {
  slug: 'park',
  label: '공원',
  emoji: '🌳',
  breadcrumbLabel: '공원',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    label: '공원 유형',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '근린공원', label: '근린공원' },
      { slug: '어린이공원', label: '어린이공원' },
      { slug: '체육공원', label: '체육공원' },
      { slug: '소공원', label: '소공원' },
      { slug: '역사공원', label: '역사공원' },
      { slug: '묘지공원', label: '묘지공원' },
      { slug: '문화공원', label: '문화공원' },
    ],
  },
  getRegionBreakdown,
  getList,
  getById,
  getLatLng,
  inferRowSummary: (item) => formatParkArea(item.raw.area),
  detailFields: (item) => {
    const r = item.raw;
    const fields: Array<{ label: string; value: string }> = [];
    if (r.parkType) fields.push({ label: '공원 유형', value: r.parkType });
    const area = formatParkArea(r.area);
    if (area) fields.push({ label: '면적', value: area });
    return fields;
  },
  renderRichSections: () => null,
};
