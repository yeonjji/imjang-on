import { prisma } from '@/lib/db';

export async function getPharmacyById(id: bigint) {
  return prisma.pharmacy.findUnique({ where: { id } });
}

export type PharmacyRecord = NonNullable<Awaited<ReturnType<typeof getPharmacyById>>>;

export async function getPharmacyLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Pharmacy" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface PharmacyListFilter {
  sigunguCode?: string;
  /** 시설명 부분일치. 근거는 `lib/hospital/index.ts`의 같은 필드 주석 참고. */
  q?: string;
}

export async function getPharmacyList(filter: PharmacyListFilter, page: number, perPage = 20) {
  const q = filter.q?.trim();
  const where = {
    sigunguCode: { not: null },
    ...(filter.sigunguCode && { sigunguCode: filter.sigunguCode }),
    ...(q && { name: { contains: q } }),
  };
  const [rows, total] = await Promise.all([
    prisma.pharmacy.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.pharmacy.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getPharmacyRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  const rows = await prisma.pharmacy.findMany({
    select: { sido: true, sigungu: true, sigunguCode: true },
    where: { sido: { not: null }, sigungu: { not: null }, sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
  return rows.map(r => ({ sido: r.sido!, sigungu: r.sigungu!, sigunguCode: r.sigunguCode! }));
}
