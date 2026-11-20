/**
 * 아파트 상세의 지역(시군구) 비교 — 순수 계산. 지역 값은 야간 스냅샷(lib/apt-region/snapshot.ts)에서 온다.
 * 원칙: 지역 수치는 항상 이 단지 값의 비교 기준으로만 쓰고, 표본이 모자라면 비교 자체를 만들지 않는다.
 */

/** 전용면적 구간. 경계는 주택 공급 통계에서 흔히 쓰는 60·85·102·135㎡. */
export const AREA_BANDS = [
  { key: 1, label: '60㎡ 미만', max: 60 },
  { key: 2, label: '60~85㎡', max: 85 },
  { key: 3, label: '85~102㎡', max: 102 },
  { key: 4, label: '102~135㎡', max: 135 },
  { key: 5, label: '135㎡ 이상', max: Infinity },
] as const;
export type AreaBandKey = (typeof AREA_BANDS)[number]['key'];

export function areaBand(sqm: number): AreaBandKey {
  return AREA_BANDS.find((b) => sqm < b.max)!.key;
}
export function areaBandLabel(key: AreaBandKey): string {
  return AREA_BANDS.find((b) => b.key === key)!.label;
}

/** 스냅샷이 저장하는 ㎡당 가격 분위점: 0,5,…,100% (21개). q[10]이 중간값. */
export const QUANTILE_STEPS = Array.from({ length: 21 }, (_, i) => i * 0.05);

/** 지역 비교칸(시군구 × 면적대)의 최소 거래 수. 미만이면 그 칸으로는 비교하지 않는다. */
export const MIN_REGION_SAMPLE = 30;
/** 단지 평형 행에 지역 위치를 붙이는 최소 매매 수(최근 12개월). */
export const MIN_ROW_SAMPLE = 3;

export interface RegionBand {
  /** 최근 12개월 매매 수 */
  n12: number;
  /** 직전 12개월(12~24개월 전) 매매 수 */
  nPrev: number;
  /** 최근 12개월 ㎡당 가격(만원) 분위점 21개. n12가 MIN_REGION_SAMPLE 미만이면 null. */
  q: number[] | null;
  /** 직전 12개월 ㎡당 가격 중간값. nPrev가 MIN_REGION_SAMPLE 미만이면 null. */
  medPrev: number | null;
}

export interface AptRegionSnapshot {
  /** 집계 단위의 표시 이름(의정부시·강남구·수원시 등). 일반구 도시는 시 단위로 묶인다. */
  label: string;
  sale12: number;
  salePrev: number;
  bands: Partial<Record<AreaBandKey, RegionBand>>;
}

/** 지역 같은 면적대 거래 중 이 값보다 싼 거래의 비율(0~100). 분위점 사이는 선형 보간. */
export function percentileOf(value: number, q: number[]): number {
  if (value <= q[0]) return 0;
  const last = q.length - 1;
  if (value >= q[last]) return 100;
  const step = 100 / last;
  for (let i = 0; i < last; i++) {
    if (value < q[i + 1]) {
      const span = q[i + 1] - q[i];
      const frac = span > 0 ? (value - q[i]) / span : 0;
      return step * i + step * frac;
    }
  }
  return 100;
}

/** "하위 22%" / "상위 15%". 극단값도 0%로 쓰지 않는다. */
export function positionLabel(pct: number): string {
  return pct < 50 ? `하위 ${Math.max(1, Math.round(pct))}%` : `상위 ${Math.max(1, Math.round(100 - pct))}%`;
}

export function pctChange(now: number, before: number): number {
  return ((now - before) / before) * 100;
}

/** 지역 같은 면적대 ㎡당 중간값 변동률(%). 두 기간 모두 표본이 충분할 때만. */
export function bandChangePct(b: RegionBand | undefined): number | null {
  if (!b || !b.q || b.medPrev == null || b.medPrev <= 0) return null;
  if (b.n12 < MIN_REGION_SAMPLE || b.nPrev < MIN_REGION_SAMPLE) return null;
  return pctChange(b.q[10], b.medPrev);
}

/** 지역 매매 거래량 변동률(%). 직전 기간 표본이 충분할 때만. */
export function volumeChangePct(n12: number, nPrev: number, minPrev: number): number | null {
  if (nPrev < minPrev) return null;
  return pctChange(n12, nPrev);
}

/** "+3.2%" / "−4.7%" / "0.0%" (마이너스는 화면 다른 곳과 같은 U+2212). */
export function signedPct(v: number): string {
  const r = Math.round(v * 10) / 10;
  if (r > 0) return `+${r.toFixed(1)}%`;
  if (r < 0) return `−${Math.abs(r).toFixed(1)}%`;
  return '0.0%';
}

export function manwonPerSqm(v: number): string {
  return `${Math.round(v).toLocaleString('ko-KR')}만원`;
}

/** 면적별 행 하나에 붙일 지역 위치. 표본이 모자라면 null. */
export interface AreaRegionRow {
  bandLabel: string;
  /** 이 평형의 최근 12개월 ㎡당 중간값 */
  ppa: number;
  pct: number;
  position: string;
  regionMedian: number;
  regionCount: number;
  /** 분포 막대용 10·25·50·75·90% */
  dist: [number, number, number, number, number];
  regionChangePct: number | null;
}

export function areaRegionRow(
  row: { areaSqm: number | null; medPpa12m: number | null; count12m: number },
  snap: AptRegionSnapshot | null,
): AreaRegionRow | null {
  if (!snap || row.areaSqm == null || row.medPpa12m == null || row.count12m < MIN_ROW_SAMPLE) return null;
  const key = areaBand(row.areaSqm);
  const b = snap.bands[key];
  if (!b || !b.q || b.n12 < MIN_REGION_SAMPLE) return null;
  const pct = percentileOf(row.medPpa12m, b.q);
  return {
    bandLabel: areaBandLabel(key),
    ppa: row.medPpa12m,
    pct,
    position: positionLabel(pct),
    regionMedian: b.q[10],
    regionCount: b.n12,
    dist: [b.q[2], b.q[5], b.q[10], b.q[15], b.q[18]],
    regionChangePct: bandChangePct(b),
  };
}

/** 단지 매매 거래량 변화의 최소 표본(직전 12개월). 5건 미만이면 ±%가 과장돼 보인다. */
export const MIN_VOLUME_PREV = 5;

export interface VolumeCompare {
  n12: number;
  nPrev: number;
  changePct: number;
  region: { label: string; changePct: number } | null;
}

/** 거래 분위기 카드에 붙일 거래량 비교. 단지 표본이 모자라면 null. */
export function volumeCompare(
  own: { n12: number; nPrev: number },
  snap: AptRegionSnapshot | null,
): VolumeCompare | null {
  const changePct = volumeChangePct(own.n12, own.nPrev, MIN_VOLUME_PREV);
  if (changePct == null) return null;
  const regionPct = snap ? volumeChangePct(snap.sale12, snap.salePrev, MIN_REGION_SAMPLE) : null;
  return {
    n12: own.n12,
    nPrev: own.nPrev,
    changePct,
    region: snap && regionPct != null ? { label: snap.label, changePct: regionPct } : null,
  };
}
