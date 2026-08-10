import { prisma } from '@/lib/db';
import type { Prisma, Childcare } from '@prisma/client';

/** Childcare의 동적 숫자 컬럼 키를 타입 안전하게 읽는다. 숫자가 아니면 null. */
export function childcareCount(item: Childcare, key: string): number | null {
  const v = (item as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

export type ChildcareTypeSlug =
  | 'all'
  | 'public'
  | 'legalwelfare'
  | 'legalorg'
  | 'private'
  | 'home'
  | 'coop'
  | 'workplace';

const TYPE_TO_KO: Record<Exclude<ChildcareTypeSlug, 'all'>, string> = {
  public: '국공립',
  legalwelfare: '사회복지법인',
  legalorg: '법인·단체등',
  private: '민간',
  home: '가정',
  coop: '협동',
  workplace: '직장',
};
const KO_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_KO).map(([k, v]) => [v, k as Exclude<ChildcareTypeSlug, 'all'>]),
) as Record<string, ChildcareTypeSlug>;

const LABEL: Record<ChildcareTypeSlug, string> = {
  all: '전체',
  public: '국공립',
  legalwelfare: '사회복지법인',
  legalorg: '법인·단체등',
  private: '민간',
  home: '가정',
  coop: '협동',
  workplace: '직장',
};

export function getChildcareTypeFromDB(crType: string | null): ChildcareTypeSlug {
  if (!crType) return 'all';
  return KO_TO_TYPE[crType] ?? 'all';
}

export function getChildcareTypeLabel(slug: ChildcareTypeSlug): string {
  return LABEL[slug] ?? '전체';
}

export interface ChildcareFilter {
  sido?: string;
  sigunguCode?: string;
  type?: ChildcareTypeSlug;
  q?: string;
  /** 'true'면 운영중지(휴지) 포함. 폐지는 실데이터 0건이므로 별도 구분 없음. */
  includeInactive?: string;
}

export function buildChildcareWhere(f: ChildcareFilter): Prisma.ChildcareWhereInput {
  const where: Prisma.ChildcareWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  else if (f.sido) where.sido = f.sido;
  if (f.type && f.type !== 'all') where.crType = TYPE_TO_KO[f.type];
  if (f.includeInactive !== 'true') {
    where.OR = [{ status: { in: ['정상', '재개'] } }, { status: null }];
  }
  if (f.q) where.name = { contains: f.q };
  return where;
}

const PER_PAGE = 20;

export async function getChildcareList(f: ChildcareFilter, page = 1) {
  const where = buildChildcareWhere(f);
  const [rows, total] = await Promise.all([
    prisma.childcare.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      // 상세 페이지가 사라지면 목록이 유일한 열람 지점이 되므로, 상세에서 판단에 쓰이던
      // 필드를 함께 싣는다. 전부 Childcare 단일 테이블 컬럼이라 조인 없이 select만 넓힌다.
      select: {
        id: true, name: true, address: true, sigunguCode: true, sigungu: true,
        crType: true, status: true, capacity: true, currentCount: true,
        waitCntTot: true, cctvCount: true, vehicleOp: true, emRoleTeacher: true, tel: true,
      },
    }),
    prisma.childcare.count({ where }),
  ]);
  return { rows, total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

export async function getChildcareById(id: bigint) {
  return prisma.childcare.findUnique({ where: { id } });
}

export async function getChildcareLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Childcare" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

/** 같은 시군구 어린이집 충원율(현원/정원) 중앙값. 벤치마크 서술용. 표본 없으면 null. */
export async function getSigunguChildcareFillMedian(sigunguCode: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ median: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY "currentCount"::float / "capacity"
    ) AS median
    FROM "Childcare"
    WHERE "sigunguCode" = ${sigunguCode}
      AND "capacity" > 0
      AND "currentCount" IS NOT NULL
  `;
  const m = rows[0]?.median;
  return m == null ? null : Number(m);
}

export async function getChildcareCountsBySigungu(filter?: { sido?: string }) {
  const grouped = await prisma.childcare.groupBy({
    by: ['sigunguCode'],
    where: {
      OR: [{ status: { in: ['정상', '재개'] } }, { status: null }],
      ...(filter?.sido ? { sido: filter.sido } : {}),
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export async function getChildcareTypeCounts(sigunguCode?: string) {
  const grouped = await prisma.childcare.groupBy({
    by: ['crType'],
    where: {
      OR: [{ status: { in: ['정상', '재개'] } }, { status: null }],
      ...(sigunguCode ? { sigunguCode } : {}),
    },
    _count: { _all: true },
  });
  const byType = {
    all: 0, public: 0, legalwelfare: 0, legalorg: 0,
    private: 0, home: 0, coop: 0, workplace: 0,
  } as Record<ChildcareTypeSlug, number>;
  let total = 0;
  for (const g of grouped) {
    const slug = getChildcareTypeFromDB(g.crType);
    byType[slug] += g._count._all;
    total += g._count._all;
  }
  byType.all = total;
  return { total, byType };
}
