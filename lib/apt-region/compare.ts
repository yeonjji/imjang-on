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
  /** 연식대별 최근 12개월 ㎡당 중간값(표본 MIN_REGION_SAMPLE 이상만). PR2 이전 스냅샷에는 없다. */
  age?: Partial<Record<1 | 2 | 3 | 4 | 5, { n12: number; med: number }>>;
}

export interface AptRegionSnapshot {
  /** 집계 단위의 표시 이름(의정부시·강남구·수원시 등). 일반구 도시는 시 단위로 묶인다. */
  label: string;
  sale12: number;
  salePrev: number;
  bands: Partial<Record<AreaBandKey, RegionBand>>;
  /** 최근 12개월 아파트 전월세 계약 지표(PR2 이전 스냅샷에는 없다). */
  rent?: RentStats;
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

// ---- 연식대(PR2: 같은 면적·비슷한 연식 기준선) ----
export const AGE_BANDS = [
  { key: 1, label: '준공 5년 이내', max: 5 },
  { key: 2, label: '준공 6~10년', max: 10 },
  { key: 3, label: '준공 11~20년', max: 20 },
  { key: 4, label: '준공 21~30년', max: 30 },
  { key: 5, label: '준공 31년 이상', max: Infinity },
] as const;
export type AgeBandKey = (typeof AGE_BANDS)[number]['key'];

/** 경과 연수 = 올해 − 준공연도. SQL(snapshot.ts)과 같은 경계를 쓴다. */
export function ageBand(builtYear: number, year = new Date().getFullYear()): AgeBandKey {
  const age = year - builtYear;
  return AGE_BANDS.find((b) => age <= b.max)!.key;
}
export function ageBandLabel(key: AgeBandKey): string {
  return AGE_BANDS.find((b) => b.key === key)!.label;
}

export interface AgeBaselineRow {
  pyeong: number;
  ppa: number;
  regionMedian: number;
  regionCount: number;
  diffPct: number;
}
export interface AgeBaseline {
  label: string;
  ageLabel: string;
  rows: AgeBaselineRow[];
}

/** 주변 단지 비교 상단 기준선: 평형별로 시군구 같은 면적대·같은 연식대 ㎡당 중간값 대비. 최대 3행. */
export function ageBaseline(
  areas: { area: number; areaSqm: number | null; medPpa12m: number | null; count12m: number }[],
  builtYear: number | null,
  snap: AptRegionSnapshot | null,
): AgeBaseline | null {
  if (!snap || builtYear == null) return null;
  const ak = ageBand(builtYear);
  const rows: AgeBaselineRow[] = [];
  for (const a of areas) {
    if (a.areaSqm == null || a.medPpa12m == null || a.count12m < MIN_ROW_SAMPLE) continue;
    const cell = snap.bands[areaBand(a.areaSqm)]?.age?.[ak];
    if (!cell || cell.n12 < MIN_REGION_SAMPLE) continue;
    rows.push({ pyeong: a.area, ppa: a.medPpa12m, regionMedian: cell.med, regionCount: cell.n12, diffPct: pctChange(a.medPpa12m, cell.med) });
    if (rows.length === 3) break;
  }
  return rows.length ? { label: snap.label, ageLabel: ageBandLabel(ak), rows } : null;
}

// ---- 전월세 계약(PR2: 갱신 블록) ----
export interface RentStats {
  /** 최근 12개월 전세+월세 계약 수 */
  rent: number;
  wolse: number;
  /** 계약구분 '갱신' */
  renew: number;
  /** 갱신요구권 사용 */
  rrUsed: number;
  /** 종전 보증금이 있는 전세 갱신 계약 수와 보증금 인상률 중간값(%) */
  jeonseRenewN: number;
  jeonseRenewIncPct: number | null;
}

/** 단지 갱신계약이 이보다 적으면 블록을 그리지 않는다(2026-11-20 결정). */
export const MIN_RENEW = 5;
/** 인상률 행을 그리는 단지 전세 갱신 최소 건수. */
export const MIN_RENEW_INC = 3;

export interface RentRow {
  label: string;
  own: string;
  ownN?: number;
  region: string | null;
}
export interface RentCompare {
  label: string;
  rent: number;
  rows: RentRow[];
  summary: string;
}

const pctOf = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
const fmtPct = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

export function rentCompare(own: RentStats, snap: AptRegionSnapshot | null): RentCompare | null {
  if (own.renew < MIN_RENEW || !snap?.rent) return null;
  const r = snap.rent;
  const regionOk = r.rent >= MIN_REGION_SAMPLE;
  const oWolse = pctOf(own.wolse, own.rent)!;
  const rWolse = regionOk ? pctOf(r.wolse, r.rent) : null;
  const oRenew = pctOf(own.renew, own.rent)!;
  const rRenew = regionOk ? pctOf(r.renew, r.rent) : null;
  const oRr = pctOf(own.rrUsed, own.renew)!;
  const rRr = r.renew >= MIN_REGION_SAMPLE ? pctOf(r.rrUsed, r.renew) : null;
  const incOk = own.jeonseRenewN >= MIN_RENEW_INC && own.jeonseRenewIncPct != null;
  const rInc = r.jeonseRenewN >= MIN_REGION_SAMPLE ? r.jeonseRenewIncPct : null;

  const rows: RentRow[] = [
    { label: '월세 비중', own: fmtPct(oWolse), ownN: own.wolse, region: rWolse != null ? fmtPct(rWolse) : null },
    { label: '갱신 계약 비중', own: fmtPct(oRenew), ownN: own.renew, region: rRenew != null ? fmtPct(rRenew) : null },
    { label: '갱신 중 갱신요구권 사용', own: fmtPct(oRr), ownN: own.rrUsed, region: rRr != null ? fmtPct(rRr) : null },
  ];
  if (incOk) {
    rows.push({
      label: '전세 갱신 보증금 인상률(중간값)',
      own: signedPct(own.jeonseRenewIncPct!),
      ownN: own.jeonseRenewN,
      region: rInc != null ? signedPct(rInc) : null,
    });
  }

  // 해석 문장: 지역과 차이가 뚜렷한 항목만 말한다(비율 10%p, 인상률 1%p). 없으면 차이가 없다고 쓴다.
  const wolseDiff = rWolse != null && Math.abs(oWolse - rWolse) >= 10 ? (oWolse < rWolse ? '낮' : '높') : null;
  const rrDiff = rRr != null && Math.abs(oRr - rRr) >= 10 ? (oRr > rRr ? '높' : '낮') : null;
  let summary: string;
  if (wolseDiff && rrDiff) {
    summary = `이 단지는 ${snap.label}보다 월세 비중이 ${wolseDiff}고, 갱신할 때 갱신요구권을 쓰는 비율이 ${rrDiff}습니다.`;
  } else if (wolseDiff) {
    summary = `이 단지는 ${snap.label}보다 월세 비중이 ${wolseDiff}습니다.`;
  } else if (rrDiff) {
    summary = `이 단지는 ${snap.label}보다 갱신할 때 갱신요구권을 쓰는 비율이 ${rrDiff}습니다.`;
  } else {
    summary = `월세 비중과 갱신요구권 사용 비율은 ${snap.label} 전체와 큰 차이가 없습니다.`;
  }
  if (incOk && rInc != null) {
    const d = own.jeonseRenewIncPct! - rInc;
    summary += Math.abs(d) < 1 ? ' 전세 갱신 시 보증금 인상률은 지역과 비슷한 수준입니다.'
      : ` 전세 갱신 시 보증금 인상률은 지역보다 ${d > 0 ? '높습니다' : '낮습니다'}.`;
  }
  return { label: snap.label, rent: own.rent, rows, summary };
}
