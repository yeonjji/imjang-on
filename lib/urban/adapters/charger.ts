import type { EvCharger, EvChargerUnit, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { UrbanCategoryDef, UrbanItem, UrbanListFilter, UrbanListResult } from '@/lib/urban/category';
import { fullSidoName, resolveAddrPrefix, URBAN_PER_PAGE as PER_PAGE } from '@/lib/urban/_shared';

export type ChargerRaw = EvCharger & { units: EvChargerUnit[] };

function buildWhere(f: UrbanListFilter, addrPrefix: string | null): Prisma.EvChargerWhereInput {
  const conditions: Prisma.EvChargerWhereInput[] = [];

  if (addrPrefix) {
    conditions.push({ address: { startsWith: addrPrefix } });
  } else if (f.sido) {
    conditions.push({ address: { startsWith: fullSidoName(f.sido) } });
  }

  if (f.sub && f.sub !== 'all') {
    conditions.push({ chargeSpeed: f.sub });
  }

  if (f.q) {
    conditions.push({ name: { contains: f.q } });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/** 원본 데이터의 일부 충전소 이름이 "_홍길동"처럼 선행 언더스코어를 달고 들어와 표시용으로 제거. */
export function displayName(name: string): string {
  return name.replace(/^_+/, '');
}

function toItem(row: ChargerRaw): UrbanItem<ChargerRaw> {
  return {
    id: row.id,
    name: displayName(row.name),
    address: row.address,
    sigunguCode: null,
    raw: row,
  };
}

async function getList(f: UrbanListFilter, page: number): Promise<UrbanListResult<ChargerRaw>> {
  const addrPrefix = await resolveAddrPrefix(f);
  if (addrPrefix === '__NO_MATCH__') {
    return { rows: [], total: 0, page, perPage: PER_PAGE, totalPages: 0 };
  }
  const where = buildWhere(f, addrPrefix);
  const [rows, total] = await Promise.all([
    prisma.evCharger.findMany({
      where,
      include: { units: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.evCharger.count({ where }),
  ]);
  return {
    rows: rows.map((r) => toItem(r as ChargerRaw)),
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE),
  };
}

async function getById(id: bigint): Promise<UrbanItem<ChargerRaw> | null> {
  const row = await prisma.evCharger.findUnique({ where: { id }, include: { units: true } });
  return row ? toItem(row as ChargerRaw) : null;
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "EvCharger" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export const chargerDef: UrbanCategoryDef<ChargerRaw> = {
  slug: 'charger',
  label: '전기차충전소',
  emoji: '⚡',
  breadcrumbLabel: '전기차충전소',
  requiresSidoScope: false,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    label: '충전 속도',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '급속', label: '급속' },
      { slug: '완속', label: '완속' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary: (item) => `${item.raw.chargeSpeed} · ${item.raw.chargerCount}기`,
  detailFields: (item) => {
    const r = item.raw;
    return [
      { label: '운영사', value: r.operatorName ?? '-' },
      { label: '충전기 수', value: `${r.chargerCount}기` },
      { label: '충전속도', value: r.chargeSpeed },
    ];
  },
  renderRichSections: () => null,
};
