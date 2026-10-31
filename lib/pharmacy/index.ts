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

// 기본 정렬: 서울 → 상세 내용 점수 → id (docs/superpowers/specs/2026-10-30-list-content-score-design.md)
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
      orderBy: [{ listRank: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.pharmacy.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

// Prisma `distinct`는 전 행을 Node로 읽어 중복 제거(0.6초) → DB DISTINCT(0.03초). lib/hospital 참고.
export async function getPharmacyRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  return prisma.$queryRaw<{ sido: string; sigungu: string; sigunguCode: string }[]>`
    SELECT DISTINCT sido, sigungu, "sigunguCode" FROM "Pharmacy"
    WHERE sido IS NOT NULL AND sigungu IS NOT NULL AND "sigunguCode" IS NOT NULL
    ORDER BY sido, sigungu`;
}
