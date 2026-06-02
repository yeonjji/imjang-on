import type { EvCharger, EvChargerUnit, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { UrbanCategoryDef, UrbanItem, UrbanListFilter, UrbanListResult } from '@/lib/urban/category';

export type ChargerRaw = EvCharger & { units: EvChargerUnit[] };

const PER_PAGE = 20;

const SIDO_FULL: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

function fullSidoName(s: string): string {
  return SIDO_FULL[s] ?? s;
}

async function resolveAddrPrefix(f: UrbanListFilter): Promise<string | null | '__NO_MATCH__'> {
  if (!f.sigunguCode) return null;
  const region = await prisma.region.findFirst({
    where: { sigunguCode: f.sigunguCode, level: 2, isAbolished: false },
    select: { sido: true, sigungu: true },
  });
  if (!region?.sido || !region?.sigungu) return '__NO_MATCH__';
  return `${region.sido} ${region.sigungu}`;
}

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

function toItem(row: ChargerRaw): UrbanItem<ChargerRaw> {
  return {
    id: row.id,
    name: row.name,
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
