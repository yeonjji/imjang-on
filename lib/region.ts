import { prisma } from '@/lib/db';

// 대한민국 17개 시도는 행정구역이 바뀌지 않으므로 정적 상수로 관리
const SIDO_LIST: { code: string; sido: string; fullName: string }[] = [
  { code: '5100000000', sido: '강원', fullName: '강원특별자치도' },
  { code: '4100000000', sido: '경기', fullName: '경기도' },
  { code: '4800000000', sido: '경남', fullName: '경상남도' },
  { code: '4700000000', sido: '경북', fullName: '경상북도' },
  { code: '2900000000', sido: '광주', fullName: '광주광역시' },
  { code: '2700000000', sido: '대구', fullName: '대구광역시' },
  { code: '3000000000', sido: '대전', fullName: '대전광역시' },
  { code: '2600000000', sido: '부산', fullName: '부산광역시' },
  { code: '1100000000', sido: '서울', fullName: '서울특별시' },
  { code: '3600000000', sido: '세종', fullName: '세종특별자치시' },
  { code: '3100000000', sido: '울산', fullName: '울산광역시' },
  { code: '2800000000', sido: '인천', fullName: '인천광역시' },
  { code: '4600000000', sido: '전남', fullName: '전라남도' },
  { code: '5200000000', sido: '전북', fullName: '전북특별자치도' },
  { code: '5000000000', sido: '제주', fullName: '제주특별자치도' },
  { code: '4400000000', sido: '충남', fullName: '충청남도' },
  { code: '4300000000', sido: '충북', fullName: '충청북도' },
];

/** 행정구역 코드 앞 2자리로 시·도 단축명(SubscriptionNotice.regionName과 동일 표기)을 반환. */
export function shortSidoFromRegionCode(
  regionCode: string | null | undefined,
): string | null {
  if (!regionCode || regionCode.length < 2) return null;
  return PREFIX_TO_SIDO[regionCode.slice(0, 2)] ?? null;
}

export function getSidoList(): Promise<{ code: string; sido: string; fullName: string }[]> {
  return Promise.resolve(SIDO_LIST);
}

export async function getSigunguByCode(sigunguCode: string) {
  return prisma.region.findFirst({
    where: { sigunguCode, level: 2, isAbolished: false },
    select: { code: true, sido: true, sigungu: true, fullName: true, sigunguCode: true },
  });
}

export async function getSigungusBySido(sido: string) {
  const sidoInfo = SIDO_LIST.find(s => s.sido === sido);
  const sidoQuery = sidoInfo?.fullName ?? sido;
  return prisma.region.findMany({
    where: { sido: sidoQuery, level: 2, isAbolished: false },
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
