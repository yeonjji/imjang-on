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

/**
 * 시도 단축명("서울")을 Region.sido에 저장된 fullName("서울특별시")으로 변환.
 * 매칭 실패 시(이미 fullName이거나 미지의 값) 입력을 그대로 돌려줘 양방향 안전.
 */
export function sidoFullName(sido: string): string {
  return SIDO_LIST.find((s) => s.sido === sido)?.fullName ?? sido;
}

export interface RegionRow {
  code: string;
  level: number;
}

/**
 * region 레코드 목록에서 MOLIT RTMS가 인식하는 시군구 LAWD_CD(5자리) → Region.code(10자리)
 * 매핑을 만든다. (순수 함수 — DB 접근 없음, 테스트 용이)
 *
 * region 시드는 fullName 단어 수로 level을 매겨, 일반구를 가진 통합시(성남·수원·고양 등)는
 * 시 자체가 level-2("경기도 성남시"=2단어), 일반구는 level-3("경기도 성남시 분당구"=3단어)로
 * 들어간다. MOLIT는 일반구 코드(41135 등)만 받고 시 코드(41130)는 0을 반환하므로,
 * 실거래가 등 구 코드로 적재되는 데이터셋은 이 집합을 시군구 단위로 써야 한다.
 *
 * 올바른 시군구 집합 = (일반구 부모시를 제외한 level-2) + (일반구 = level-3, 코드 끝 "00000").
 * - 일반구: level-3이면서 code가 "00000"으로 끝남(읍면동은 6자리 이후가 채워져 제외됨).
 * - 제외 대상 통합시: 각 일반구의 부모시 코드(앞 4자리 + "000000").
 * 세종은 동이 level-2(2단어)라 prefix 36110으로 자연 collapse되어 1건으로 처리된다.
 *
 * 적재(scripts/ingest/transactions/sigungu.ts)와 서빙(getSigungusBySido gu)의 공용 SSOT.
 */
export function selectSigunguTargets(regions: RegionRow[]): Map<string, string> {
  const ilbangu = regions.filter((r) => r.level === 3 && r.code.slice(5) === '00000');
  const excludeCity = new Set(ilbangu.map((g) => `${g.code.slice(0, 4)}000000`));

  const map = new Map<string, string>();
  for (const r of regions) {
    if (r.level === 2 && !excludeCity.has(r.code)) map.set(r.code.slice(0, 5), r.code);
  }
  for (const g of ilbangu) map.set(g.code.slice(0, 5), g.code);
  return map;
}

/** fullName("경기도 수원시 장안구")에서 시도를 떼어 시군구 라벨("수원시 장안구")을 만든다. */
function stripSido(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
}

export async function getSigunguByCode(sigunguCode: string) {
  return prisma.region.findFirst({
    where: { sigunguCode, level: 2, isAbolished: false },
    select: { code: true, sido: true, sigungu: true, fullName: true, sigunguCode: true },
  });
}

/**
 * 시도 단축명으로 시군구 드롭다운 목록을 반환.
 * - 기본(opts.gu 미지정): level-2만 — 학교·시장 등 시 코드로 적재된 데이터셋용(기존 동작).
 * - opts.gu=true: 일반구 통합시를 구 단위로 노출 — 실거래가·상가 등 구 코드 적재 데이터셋용.
 *   selectSigunguTargets와 동일 집합이라 드롭다운 선택값이 데이터의 sigunguCode와 정확히 일치한다.
 */
export async function getSigungusBySido(sido: string, opts?: { gu?: boolean }) {
  const sidoInfo = SIDO_LIST.find(s => s.sido === sido);
  const sidoQuery = sidoInfo?.fullName ?? sido;

  if (!opts?.gu) {
    return prisma.region.findMany({
      where: { sido: sidoQuery, level: 2, isAbolished: false },
      select: { code: true, sigungu: true, fullName: true, sigunguCode: true },
      orderBy: { sigungu: 'asc' },
    });
  }

  // 일반구(level-3, 코드 끝 "00000")만 함께 끌어온다(읍면동 level-3은 끝자리가 채워져 제외).
  const rows = await prisma.region.findMany({
    where: {
      sido: sidoQuery,
      isAbolished: false,
      OR: [{ level: 2 }, { level: 3, code: { endsWith: '00000' } }],
    },
    select: { code: true, level: true, sigungu: true, eupmyeondong: true, fullName: true, sigunguCode: true },
  });
  const keep = new Set(selectSigunguTargets(rows).values());
  return rows
    .filter((r) => keep.has(r.code))
    .map((r) => ({
      code: r.code,
      // 일반구(level-3)는 구명이 eupmyeondong에 있어 "수원시 장안구"로 합쳐 표시한다.
      sigungu: r.level === 3 && r.eupmyeondong ? `${r.sigungu} ${r.eupmyeondong}` : r.sigungu,
      fullName: r.fullName,
      sigunguCode: r.sigunguCode,
    }))
    .sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko'));
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

export interface PopularRegion {
  sigunguCode: string;
  sido: string;
  sigungu: string;
}

/**
 * 거래량(최근 90일) 기준 인기 시군구 상위 N개.
 * 최근 90일 결과가 limit 미만이면 전체 기간으로 폴백한다.
 * 메인 페이지 ISR(revalidate=3600)로 캐시되므로 시간당 1회만 집계된다.
 */
export async function getPopularSigungus(limit = 6): Promise<PopularRegion[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  async function topCodes(where: { contractDate?: { gte: Date } }) {
    const rows = await prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where,
      _count: { sigunguCode: true },
      orderBy: { _count: { sigunguCode: 'desc' } },
      take: limit,
    });
    return rows.map((r) => r.sigunguCode);
  }

  let codes = await topCodes({ contractDate: { gte: since } });
  if (codes.length < limit) {
    codes = await topCodes({});
  }
  if (codes.length === 0) return [];

  // 일반구 통합시는 구 코드(level-3)로 거래가 쌓이므로 시군구 단위 행(level-2 + 일반구 level-3)을
  // 모두 조회해 라벨을 붙인다. (level-2만 보면 수원·성남 등이 인기지역에서 통째로 누락된다.)
  // 읍면동(level-3, 코드 끝 ≠ 00000)은 같은 sigunguCode를 공유해 라벨을 덮으므로 제외한다.
  const regions = await prisma.region.findMany({
    where: {
      sigunguCode: { in: codes },
      isAbolished: false,
      OR: [{ level: 2 }, { level: 3, code: { endsWith: '00000' } }],
    },
    select: { sigunguCode: true, fullName: true },
  });
  const labelByCode = new Map(
    regions
      .filter((r): r is typeof r & { sigunguCode: string } => r.sigunguCode !== null)
      .map((r) => [r.sigunguCode, stripSido(r.fullName)]),
  );

  const result: PopularRegion[] = [];
  for (const code of codes) {
    const sigungu = labelByCode.get(code);
    const sido = sidoFromPrefix(code.slice(0, 2));
    if (!sigungu || !sido) continue;
    result.push({ sigunguCode: code, sido, sigungu });
  }
  return result;
}
