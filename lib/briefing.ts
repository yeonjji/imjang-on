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

/** 급증 동네용 계약일 윈도우(최근 30일 / 직전 30일)의 KST 날짜 경계.
 *  기준점: 오늘 KST 자정 + 1일 (= 오늘 KST 끝, 미포함 상한)
 *  최근 30일: [기준 - 29일, 기준)  → recentStart
 *  직전 30일: [기준 - 59일, 기준 - 29일)  → prevStart
 */
export function contractDateWindows(now: Date): {
  recentStart: Date; // 최근 30일 시작(포함)
  prevStart: Date; // 직전 30일 시작(포함)
  prevEnd: Date; // 직전 30일 끝(= recentStart, 미포함)
} {
  const day = 24 * 60 * 60 * 1000;
  // 오늘 KST 자정 + 1일 = 내일 KST 자정 = 오늘 KST 전체를 포함하는 상한
  const tomorrowKstStart = new Date(kstDayStartUtc(now).getTime() + day);
  const recentStart = new Date(tomorrowKstStart.getTime() - 29 * day);
  const prevStart = new Date(tomorrowKstStart.getTime() - 59 * day);
  return { recentStart, prevStart, prevEnd: recentStart };
}

const AREA_BANDS: { max: number; label: string }[] = [
  { max: 60, label: '전용 60㎡ 이하' },
  { max: 85, label: '전용 60~85㎡' },
  { max: 102, label: '전용 85~102㎡' },
  { max: 135, label: '전용 102~135㎡' },
  { max: Infinity, label: '전용 135㎡ 초과' },
];

export function areaBandLabel(sqm: number): string {
  return AREA_BANDS.find((b) => sqm < b.max)!.label;
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
