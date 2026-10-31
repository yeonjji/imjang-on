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
      nemcHours: true,
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
  /** 시설명 부분일치. 시군구당 수백~수천 곳이라 이름으로 좁히지 못하면 목록에서 특정 시설에 도달할 수 없다. */
  q?: string;
}

// 기본 정렬: 서울 → 상세 내용 점수 → id (docs/superpowers/specs/2026-10-30-list-content-score-design.md)
export async function getHospitalList(filter: HospitalListFilter, page: number, perPage = 20) {
  const q = filter.q?.trim();
  const where = {
    sigunguCode: { not: null },
    ...(filter.sigunguCode && { sigunguCode: filter.sigunguCode }),
    ...(filter.typeCode && { typeCode: filter.typeCode }),
    ...(q && { name: { contains: q } }),
  };
  const [rows, total] = await Promise.all([
    prisma.hospital.findMany({
      where,
      orderBy: [{ listRank: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      // 상세 페이지가 사라지면 목록이 유일한 열람 지점이 되므로, 상세에서 판단에 쓰이던
      // 축(응급실·주차·진료과 수·일반병상)을 카드가 쓸 수 있게 함께 읽는다.
      include: {
        detail: { select: { erDayOpen: true, erNightOpen: true, parkingCapacity: true } },
        facility: { select: { generalBedPremium: true, generalBedNormal: true } },
        _count: { select: { depts: true } },
      },
    }),
    prisma.hospital.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export type HospitalListRow = Awaited<ReturnType<typeof getHospitalList>>['rows'][number];

// 필터 옵션은 DB에서 DISTINCT로 접는다. Prisma `distinct`는 전 행(병원 약 8만)을 읽어 Node에서
// 중복 제거해 목록 진입마다 1.6초(지역)+0.4초(종별)가 걸렸다 — DB DISTINCT는 0.07초·0.05초.
export async function getHospitalRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  return prisma.$queryRaw<{ sido: string; sigungu: string; sigunguCode: string }[]>`
    SELECT DISTINCT sido, sigungu, "sigunguCode" FROM "Hospital"
    WHERE sido IS NOT NULL AND sigungu IS NOT NULL AND "sigunguCode" IS NOT NULL
    ORDER BY sido, sigungu`;
}

export async function getHospitalTypeCodes(): Promise<{ typeCode: string; typeName: string }[]> {
  return prisma.$queryRaw<{ typeCode: string; typeName: string }[]>`
    SELECT DISTINCT "typeCode", "typeName" FROM "Hospital" ORDER BY "typeName"`;
}
