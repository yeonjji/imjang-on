import { prisma } from '@/lib/db';

export async function getHospitalById(id: bigint) {
  return prisma.hospital.findUnique({
    where: { id },
    include: {
      facility: true,
      detail: true,
      depts: { orderBy: { deptName: 'asc' } },
      transits: true,
      equipment: { orderBy: { equipName: 'asc' } },
      mealSurcharges: true,
      nursingGrades: true,
      specialTreatments: { orderBy: { searchName: 'asc' } },
      specialties: { orderBy: { searchName: 'asc' } },
      staff: true,
    },
  });
}

export type HospitalWithRelations = NonNullable<Awaited<ReturnType<typeof getHospitalById>>>;

export async function getHospitalLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Hospital" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface HospitalListFilter {
  sigunguCode?: string;
  typeCode?: string;
}

export async function getHospitalList(filter: HospitalListFilter, page: number, perPage = 20) {
  const where = {
    ...(filter.sigunguCode && { sigunguCode: filter.sigunguCode }),
    ...(filter.typeCode && { typeCode: filter.typeCode }),
  };
  const [rows, total] = await Promise.all([
    prisma.hospital.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.hospital.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getHospitalRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  const rows = await prisma.hospital.findMany({
    select: { sido: true, sigungu: true, sigunguCode: true },
    where: { sido: { not: null }, sigungu: { not: null }, sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
  return rows.map(r => ({ sido: r.sido!, sigungu: r.sigungu!, sigunguCode: r.sigunguCode! }));
}

export async function getHospitalTypeCodes(): Promise<{ typeCode: string; typeName: string }[]> {
  return prisma.hospital.findMany({
    select: { typeCode: true, typeName: true },
    distinct: ['typeCode'],
    orderBy: { typeName: 'asc' },
  });
}
