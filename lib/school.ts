import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type SchoolKindSlug = 'all' | 'elem' | 'mid' | 'high' | 'special';
export type FoundSlug = 'all' | 'public' | 'private';
export type CoeduSlug = 'all' | 'male' | 'female' | 'co';

export interface SchoolFilter {
  sido?: string;
  sigunguCode?: string;
  kind?: SchoolKindSlug;
  found?: FoundSlug;
  coedu?: CoeduSlug;
  q?: string;
}

const KIND_MAP: Record<Exclude<SchoolKindSlug, 'all'>, string> = {
  elem: '초등학교',
  mid: '중학교',
  high: '고등학교',
  special: '특수학교',
};

export function buildSchoolWhere(f: SchoolFilter): Prisma.SchoolWhereInput {
  const where: Prisma.SchoolWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  else if (f.sido) where.region = f.sido;
  if (f.kind && f.kind !== 'all') where.schoolKind = KIND_MAP[f.kind];
  if (f.found === 'public') where.foundType = { in: ['공립', '국립'] };
  else if (f.found === 'private') where.foundType = '사립';
  if (f.coedu === 'co') where.coeduType = '남여공학';
  else if (f.coedu === 'male') where.coeduType = '남';
  else if (f.coedu === 'female') where.coeduType = '여';
  if (f.q) where.name = { contains: f.q };
  return where;
}

const PER_PAGE = 30;

export async function getSchoolList(f: SchoolFilter, page = 1) {
  const where = buildSchoolWhere(f);
  // 상세 URL이 /school/[sigunguCode]/[id]라서 지역 미지정 목록도 sigunguCode 있는 학교만 노출
  if (!f.sigunguCode) where.sigunguCode = { not: null };
  const [rows, total] = await Promise.all([
    prisma.school.findMany({
      where,
      orderBy: [{ schoolKind: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.school.count({ where }),
  ]);
  return { rows, total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

export async function getSchoolById(id: bigint) {
  return prisma.school.findUnique({ where: { id } });
}

export async function getSchoolKindCounts(sigunguCode: string) {
  const grouped = await prisma.school.groupBy({
    by: ['schoolKind'],
    where: { sigunguCode },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const g of grouped) {
    counts[g.schoolKind ?? '기타'] = g._count._all;
    total += g._count._all;
  }
  return { total, counts };
}
