import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  UrbanCategoryDef,
  UrbanItem,
  UrbanListFilter,
  UrbanListResult,
} from '@/lib/urban/category';
import { fullSidoName, resolveAddrPrefix, URBAN_PER_PAGE as PER_PAGE } from '@/lib/urban/_shared';

export type ParkingRaw = NonNullable<Awaited<ReturnType<typeof prisma.parking.findFirst>>>;

function buildWhereWithPrefix(f: UrbanListFilter, addrPrefix: string | null): Prisma.ParkingWhereInput {
  const where: Prisma.ParkingWhereInput = {};

  if (addrPrefix) {
    where.OR = [
      { rdnmadr: { startsWith: addrPrefix } },
      { lnmadr: { startsWith: addrPrefix } },
    ];
  } else if (f.sido) {
    const prefix = fullSidoName(f.sido);
    where.OR = [
      { rdnmadr: { startsWith: prefix } },
      { lnmadr: { startsWith: prefix } },
    ];
  }

  if (f.sub && f.sub !== 'all') where.prkplceSe = f.sub;
  if (f.charge === '무료' || f.charge === '유료') where.chargeInfo = f.charge;
  if (f.type) where.prkplceType = f.type;
  if (f.pwd === 'on') where.pwdbsPpkZoneYn = true;
  if (f.open24 === 'on') {
    // 종일 개방은 데이터상 "00:00"~"23:59"로 저장됨 (콜론 포함 HH:MM)
    where.weekdayOpenHhmm = '00:00';
    where.weekdayCloseHhmm = '23:59';
  }
  if (f.q) where.name = { contains: f.q };

  return where;
}

function toItem(row: ParkingRaw): UrbanItem<ParkingRaw> {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    sigunguCode: null,
    raw: row,
  };
}

async function getList(f: UrbanListFilter, page: number): Promise<UrbanListResult<ParkingRaw>> {
  const addrPrefix = await resolveAddrPrefix(f);
  if (addrPrefix === '__NO_MATCH__') {
    return { rows: [], total: 0, page, perPage: PER_PAGE, totalPages: 0 };
  }
  const where = buildWhereWithPrefix(f, addrPrefix);
  const [rows, total] = await Promise.all([
    prisma.parking.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.parking.count({ where }),
  ]);
  return {
    rows: rows.map(toItem),
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE),
  };
}

async function getById(id: bigint): Promise<UrbanItem<ParkingRaw> | null> {
  const row = await prisma.parking.findUnique({ where: { id } });
  return row ? toItem(row) : null;
}

async function getRegionBreakdown(_f: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  return []; // Parking 모델은 sigunguCode 컬럼 미보유(rdnmadr/lnmadr 주소 파싱 기반) → 분포 생략
}

async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Parking" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export const parkingDef: UrbanCategoryDef<ParkingRaw> = {
  slug: 'parking',
  label: '주차장',
  emoji: '🅿️',
  breadcrumbLabel: '주차장',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '공영', label: '공영' },
      { slug: '민영', label: '민영' },
    ],
  },
  getRegionBreakdown,
  getList,
  getById,
  getLatLng,
  inferRowSummary: (item) => {
    const r = item.raw;
    const parts: string[] = [];
    if (r.prkcmprt != null) parts.push(`${r.prkcmprt}면`);
    if (r.chargeInfo) parts.push(r.chargeInfo);
    return parts.length > 0 ? parts.join(' · ') : null;
  },
  detailFields: (item) => {
    const r = item.raw;
    return [
      { label: '구분',         value: r.prkplceSe ?? '-' },
      { label: '유형',         value: r.prkplceType ?? '-' },
      { label: '도로명 주소', value: r.rdnmadr ?? '-' },
      { label: '지번 주소',   value: r.lnmadr ?? '-' },
      { label: '운영기관',     value: r.institutionNm ?? r.insttNm ?? '-' },
      { label: '전화',         value: r.phoneNumber ?? '-' },
      { label: '기준일자',     value: r.referenceDate ? r.referenceDate.toISOString().slice(0, 10) : '-' },
      { label: '결제수단',     value: r.metpay ?? '-' },
    ];
  },
  renderRichSections: () => null,
};
