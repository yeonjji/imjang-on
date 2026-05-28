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

const SIDO_PREFIX: Record<string, string> = {
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '51', '충북': '43', '충남': '44',
  '전북': '52', '전남': '46', '경북': '47', '경남': '48',
  '제주': '50',
};

export function sidoPrefix(sido: string): string | undefined {
  if (!sido) return undefined;
  return SIDO_PREFIX[sido]
    ?? SIDO_PREFIX[sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')];
}

const PREFIX_TO_SIDO: Record<string, string> = Object.fromEntries(
  Object.entries(SIDO_PREFIX).map(([k, v]) => [v, k]),
);

export function sidoFromPrefix(prefix: string): string | undefined {
  if (!prefix) return undefined;
  return PREFIX_TO_SIDO[prefix];
}
