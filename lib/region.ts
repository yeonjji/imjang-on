import { prisma } from '@/lib/db';

export async function getSidoList() {
  return prisma.region.findMany({
    where: { level: 1, isAbolished: false },
    select: { code: true, sido: true, fullName: true },
    orderBy: { sido: 'asc' },
  });
}

export async function getSigunguByCode(sigunguCode: string) {
  return prisma.region.findFirst({
    where: { sigunguCode, level: 2, isAbolished: false },
    select: { code: true, sido: true, sigungu: true, fullName: true, sigunguCode: true },
  });
}

export async function getSigungusBySido(sido: string) {
  return prisma.region.findMany({
    where: { sido, level: 2, isAbolished: false },
    select: { code: true, sigungu: true, fullName: true, sigunguCode: true },
    orderBy: { sigungu: 'asc' },
  });
}

export async function getEupmyeondongsBySigungu(sigunguCode: string) {
  return prisma.region.findMany({
    where: { sigunguCode, level: 3, isAbolished: false },
    select: { code: true, eupmyeondong: true, fullName: true },
    orderBy: { eupmyeondong: 'asc' },
  });
}

export async function getAllSigungus() {
  return prisma.region.findMany({
    where: { level: 2, isAbolished: false, sigunguCode: { not: null } },
    select: { sido: true, sigungu: true, sigunguCode: true },
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
}
