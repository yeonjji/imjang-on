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

// ---- 타입 (Task 3에서 사용) ----
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
