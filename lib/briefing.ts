import { prisma } from '@/lib/db';
import { DealType, Prisma } from '@prisma/client';
import { formatDate } from '@/lib/format';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각이 속한 KST '오늘'의 자정을 UTC Date로 반환. */
export function kstDayStartUtc(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST 자정 = 해당 KST 날짜 00:00에서 KST_OFFSET을 빼면 UTC
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
}

/** 급증 동네용 계약일 윈도우(최근 30일 / 직전 30일)의 경계.
 *  contractDate는 @db.Date(자정 UTC)이므로 KST 달력 날짜를 자정 UTC로 환산해 계산. */
export function contractDateWindows(now: Date): {
  recentStart: Date; // 최근 30일 시작(포함): [recentStart, 오늘+1)  → 30일
  prevStart: Date; // 직전 30일 시작(포함): [prevStart, prevEnd)   → 30일
  prevEnd: Date; // = recentStart (인접·비중첩)
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const todayUtcMidnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const day = 24 * 60 * 60 * 1000;
  const recentStart = new Date(todayUtcMidnight - 29 * day);
  const prevStart = new Date(todayUtcMidnight - 59 * day);
  return { recentStart, prevStart, prevEnd: recentStart };
}

const AREA_BANDS: { max: number; label: string }[] = [
  { max: 60, label: '전용 60㎡ 미만' },
  { max: 85, label: '전용 60~85㎡' },
  { max: 102, label: '전용 85~102㎡' },
  { max: 135, label: '전용 102~135㎡' },
  { max: Infinity, label: '전용 135㎡ 초과' },
];

export function areaBandLabel(sqm: number): string {
  const band = AREA_BANDS.find((b) => sqm < b.max);
  if (!band) throw new Error(`areaBandLabel: unexpected sqm value ${sqm}`);
  return band.label;
}

/** "경기도 수원시 영통구" → "수원시 영통구" (시·도 토큰 제거). 단일 토큰은 그대로. */
export function regionLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
}

export function buildHashtags(input: {
  txCount: number;
  topRegionLabel: string | null;
  topAreaLabel: string | null;
  highestRegionLabel: string | null;
}): string[] {
  const tags = ['#오늘의실거래', `#매매 ${input.txCount.toLocaleString('ko-KR')}건`];
  if (input.highestRegionLabel) tags.push(`#최고가 ${input.highestRegionLabel}`);
  if (input.topAreaLabel) tags.push(`#${input.topAreaLabel.replace(/\s/g, '')} 최다`);
  if (input.topRegionLabel) tags.push(`#${input.topRegionLabel}`);
  return tags;
}

// ---- 타입 + DB 집계 (Task 3) ----
export interface TxHighlight {
  propertyId: string;
  propertyName: string;
  regionLabel: string;
  amountManwon: number;
}
export interface RegionCount {
  code: string;
  label: string;
  count: number;
}
export interface SurgeRegion {
  code: string;
  label: string;
  recent: number;
  prev: number;
  changePct: number;
}
export interface MarketBriefing {
  refDate: string;
  isFallback: boolean;
  summary: {
    txCount: number;
    highest: TxHighlight | null;
    lowest: TxHighlight | null;
    topRegion: RegionCount | null;
    topAreaBand: { label: string; count: number } | null;
  };
  popularRegions: RegionCount[];
  surgeRegions: SurgeRegion[];
  hashtags: string[];
}

const SURGE_MIN_RECENT = 30; // 급증 후보 최소 최근거래 건수(노이즈 필터)

/** sigunguCode 집합 → { sigunguCode: {code, label} } 매핑 */
async function resolveRegions(codes: string[]): Promise<Map<string, { code: string; label: string }>> {
  const rows = await prisma.region.findMany({
    where: { sigunguCode: { in: codes }, level: 2 },
    select: { sigunguCode: true, code: true, fullName: true },
  });
  const map = new Map<string, { code: string; label: string }>();
  for (const r of rows) {
    if (r.sigunguCode) map.set(r.sigunguCode, { code: r.code, label: regionLabel(r.fullName) });
  }
  return map;
}

export async function getMarketBriefing(now: Date = new Date()): Promise<MarketBriefing | null> {
  // 1) 수집일 창: 오늘(KST) createdAt 이상. 0건이면 최신 createdAt 날짜로 폴백.
  let start = kstDayStartUtc(now);
  let isFallback = false;
  const saleWhere = (gte: Date): Prisma.TransactionWhereInput => ({ dealType: DealType.SALE, createdAt: { gte } });

  let txCount = await prisma.transaction.count({ where: saleWhere(start) });
  let refDate = formatDate(start);
  if (txCount === 0) {
    const latest = await prisma.transaction.findFirst({
      where: { dealType: DealType.SALE },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return null;
    start = kstDayStartUtc(latest.createdAt);
    isFallback = true;
    txCount = await prisma.transaction.count({ where: saleWhere(start) });
    refDate = formatDate(start);
    if (txCount === 0) return null;
  }
  const where = saleWhere(start);

  // 2) 요약 + 인기동네
  const [highestRow, lowestRow, regionGroups, areaBandCounts] = await Promise.all([
    prisma.transaction.findFirst({
      where: { ...where, dealAmount: { not: null } },
      orderBy: { dealAmount: 'desc' },
      select: { propertyId: true, dealAmount: true, sigunguCode: true, property: { select: { name: true } } },
    }),
    prisma.transaction.findFirst({
      where: { ...where, dealAmount: { gt: 0 } },
      orderBy: { dealAmount: 'asc' },
      select: { propertyId: true, dealAmount: true, sigunguCode: true, property: { select: { name: true } } },
    }),
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where,
      _count: { _all: true },
      orderBy: { _count: { sigunguCode: 'desc' } },
      take: 5,
    }),
    Promise.all(
      AREA_BANDS.map(async (band, i) => {
        const min = i === 0 ? 0 : AREA_BANDS[i - 1].max;
        const count = await prisma.transaction.count({
          where: {
            ...where,
            exclusiveArea: {
              gte: new Prisma.Decimal(min),
              ...(band.max !== Infinity ? { lt: new Prisma.Decimal(band.max) } : {}),
            },
          },
        });
        return { label: band.label, count };
      }),
    ),
  ]);

  // 3) 급증 동네: 계약일 창 비교
  const { recentStart, prevStart, prevEnd } = contractDateWindows(now);
  const [recentGroups, prevGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where: { dealType: DealType.SALE, contractDate: { gte: recentStart } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where: { dealType: DealType.SALE, contractDate: { gte: prevStart, lt: prevEnd } },
      _count: { _all: true },
    }),
  ]);

  // 4) 지역 라벨 일괄 해석
  const allCodes = new Set<string>();
  if (highestRow) allCodes.add(highestRow.sigunguCode);
  if (lowestRow) allCodes.add(lowestRow.sigunguCode);
  regionGroups.forEach((g) => allCodes.add(g.sigunguCode));
  recentGroups.forEach((g) => allCodes.add(g.sigunguCode));
  const regionMap = await resolveRegions(Array.from(allCodes));
  const labelOf = (sgg: string) => regionMap.get(sgg)?.label ?? sgg;
  const codeOf = (sgg: string) => regionMap.get(sgg)?.code ?? sgg;

  // 5) 조립
  const topAreaBand = areaBandCounts.reduce((a, b) => (b.count > a.count ? b : a));
  const popularRegions: RegionCount[] = regionGroups.map((g) => ({
    code: codeOf(g.sigunguCode),
    label: labelOf(g.sigunguCode),
    count: g._count._all,
  }));
  const topRegion = popularRegions[0] ?? null;

  const prevMap = new Map(prevGroups.map((g) => [g.sigunguCode, g._count._all]));
  const surgeRegions: SurgeRegion[] = recentGroups
    .filter((g) => g._count._all >= SURGE_MIN_RECENT)
    .map((g) => {
      const recent = g._count._all;
      const prev = prevMap.get(g.sigunguCode) ?? 0;
      const changePct = prev === 0 ? 100 : Math.round(((recent - prev) / prev) * 100);
      return { code: codeOf(g.sigunguCode), label: labelOf(g.sigunguCode), recent, prev, changePct };
    })
    .filter((s) => s.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 3);

  const highest: TxHighlight | null = highestRow
    ? { propertyId: String(highestRow.propertyId), propertyName: highestRow.property.name, regionLabel: labelOf(highestRow.sigunguCode), amountManwon: highestRow.dealAmount! }
    : null;
  const lowest: TxHighlight | null = lowestRow
    ? { propertyId: String(lowestRow.propertyId), propertyName: lowestRow.property.name, regionLabel: labelOf(lowestRow.sigunguCode), amountManwon: lowestRow.dealAmount! }
    : null;

  const hashtags = buildHashtags({
    txCount,
    topRegionLabel: topRegion?.label ?? null,
    topAreaLabel: topAreaBand.count > 0 ? topAreaBand.label : null,
    highestRegionLabel: highest?.regionLabel ?? null,
  });

  return {
    refDate,
    isFallback,
    summary: { txCount, highest, lowest, topRegion, topAreaBand: topAreaBand.count > 0 ? topAreaBand : null },
    popularRegions,
    surgeRegions,
    hashtags,
  };
}
