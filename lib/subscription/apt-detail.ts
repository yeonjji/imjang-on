import { formatDate, sqmToPyeong } from '@/lib/format';
import { UNVERIFIED_AMOUNT_SUSPECTS } from '@/lib/subscription/amount-corrections';

/**
 * APT 공고 상세 보강(일정 세분화·규제 배지·특공 유형별·3.3㎡당). 전부 이미 수집된 rawJson에서 읽는다.
 * APT(청약홈 APT 분양정보)만 이 필드들이 있다 — 다른 유형은 null/빈 값을 돌려 기존 화면을 유지한다.
 * 실측(2026-11-18, APT 2,943공고): 1순위 일정 100% · 특공 접수 2,310 · 분양가상한제 766 · 조정대상 754.
 */

type Raw = Record<string, unknown>;
const raw = (j: unknown): Raw => (j && typeof j === 'object' ? (j as Raw) : {});
const yes = (v: unknown) => v === 'Y';

// ---- 규제·유형 배지 ----
const FLAG_BADGES: [key: string, label: string][] = [
  ['PARCPRC_ULS_AT', '분양가상한제'],
  ['SPECLT_RDN_EARTH_AT', '투기과열지구'],
  ['MDAT_TRGET_AREA_SECD', '조정대상지역'],
  ['LRSCL_BLDLND_AT', '대규모 택지개발지구'],
  ['PUBLIC_HOUSE_EARTH_AT', '공공주택지구'],
  ['IMPRMN_BSNS_AT', '정비사업'],
];

/** 청약홈 값이 Y인 항목만. 국민/민영은 값이 있으면 맨 앞. */
export function aptNoticeBadges(category: string, rawJson: unknown): string[] {
  if (category !== 'APT') return [];
  const r = raw(rawJson);
  const out: string[] = [];
  const dtl = r.HOUSE_DTL_SECD_NM;
  if (dtl === '국민' || dtl === '민영') out.push(`${dtl}주택`);
  for (const [key, label] of FLAG_BADGES) if (yes(r[key])) out.push(label);
  return out;
}

// ---- 일정 세분화 ----
function day(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  if (!m) return null;
  return formatDate(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
function range(begin: unknown, end: unknown): string | null {
  const b = day(begin);
  const e = day(end);
  if (!b && !e) return null;
  if (!b || !e || b === e) return (b ?? e)!;
  return `${b} ~ ${e}`;
}

export interface RankSchedule {
  /** 세부 지역 날짜가 모두 같으면 그 값, 다르면 null(세부 행을 보여준다) */
  value: string | null;
  areas: { label: string; value: string }[];
}
export interface AptSchedule {
  special: string | null;
  rank1: RankSchedule | null;
  rank2: RankSchedule | null;
}

const RANK_AREAS: [suffix: string, label: string][] = [
  ['CRSPAREA', '해당지역'],
  ['ETC_GG', '기타경기'],
  ['ETC_AREA', '기타지역'],
];

function rank(r: Raw, n: 1 | 2): RankSchedule | null {
  const areas = RANK_AREAS.flatMap(([suffix, label]) => {
    const value = range(r[`GNRL_RNK${n}_${suffix}_RCPTDE`], r[`GNRL_RNK${n}_${suffix}_ENDDE`]);
    return value ? [{ label, value }] : [];
  });
  if (areas.length === 0) return null;
  const same = areas.every((a) => a.value === areas[0].value);
  return { value: same ? areas[0].value : null, areas };
}

/** APT가 아니거나 1순위 일정이 없으면 null → 기존 접수 시작/마감 표시. */
export function aptSchedule(category: string, rawJson: unknown): AptSchedule | null {
  if (category !== 'APT') return null;
  const r = raw(rawJson);
  const rank1 = rank(r, 1);
  if (!rank1) return null;
  return { special: range(r.SPSPLY_RCEPT_BGNDE, r.SPSPLY_RCEPT_ENDDE), rank1, rank2: rank(r, 2) };
}

// ---- 특별공급 유형별 세대수 ----
const SPECIAL_TYPES: [key: string, label: string][] = [
  ['NWBB_HSHLDCO', '신생아'],
  ['LFE_FRST_HSHLDCO', '생애최초'],
  ['INSTT_RECOMEND_HSHLDCO', '기관추천'],
  ['MNYCH_HSHLDCO', '다자녀'],
  ['NWWDS_HSHLDCO', '신혼부부'],
  ['OLD_PARNTS_SUPORT_HSHLDCO', '노부모부양'],
  ['YGMN_HSHLDCO', '청년'],
  ['TRANSR_INSTT_ENFSN_HSHLDCO', '이전기관'],
  ['ETC_HSHLDCO', '기타'],
];

export interface SpecialBreakdown {
  /** 세대수가 하나라도 있는 유형만, 합계 많은 순(기타는 맨 뒤) */
  columns: string[];
  rows: { houseType: string; counts: number[] }[];
  totals: number[];
  total: number;
}

const count = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * 유형별 합이 그 주택형의 특공 세대수(SPSPLY_HSHLDCO)와 다른 주택형은 뺀다(실측 1.8%) —
 * 맞지 않는 숫자를 나란히 두지 않는다. 남는 주택형이 없거나 특공이 0이면 null.
 */
export function specialSupplyBreakdown(
  units: { houseType: string | null; rawJson: unknown }[],
): SpecialBreakdown | null {
  const rows = units.flatMap((u) => {
    const r = raw(u.rawJson);
    const total = count(r.SPSPLY_HSHLDCO);
    const counts = SPECIAL_TYPES.map(([k]) => count(r[k]));
    if (!total || counts.some((c) => c === null)) return [];
    const nums = counts as number[];
    if (nums.reduce((a, b) => a + b, 0) !== total) return [];
    return [{ houseType: u.houseType ?? '-', counts: nums }];
  });
  if (rows.length === 0) return null;

  const sums = SPECIAL_TYPES.map((_, i) => rows.reduce((a, r) => a + r.counts[i], 0));
  const idx = SPECIAL_TYPES.map((_, i) => i)
    .filter((i) => sums[i] > 0)
    .sort((a, b) => {
      const etcA = SPECIAL_TYPES[a][0] === 'ETC_HSHLDCO' ? 1 : 0;
      const etcB = SPECIAL_TYPES[b][0] === 'ETC_HSHLDCO' ? 1 : 0;
      return etcA - etcB || sums[b] - sums[a] || a - b;
    });
  return {
    columns: idx.map((i) => SPECIAL_TYPES[i][1]),
    rows: rows.map((r) => ({ houseType: r.houseType, counts: idx.map((i) => r.counts[i]) })),
    totals: idx.map((i) => sums[i]),
    total: idx.reduce((a, i) => a + sums[i], 0),
  };
}

// ---- 3.3㎡당 분양가 ----
/**
 * 실측 최댓값(포제스 한강 15,845만원) 위로 여유를 둔 상한. 이 값을 넘으면 원자료 단위 오기로 보고
 * 3.3㎡당을 내지 않는다(새로 들어오는 오기 공고용 안전장치 — 금액 칸은 그대로 둔다).
 */
export const MAX_PRICE_PER_PYEONG = 20_000;

/**
 * APT 분양주택만(임대 제외), 최고 분양가 ÷ 공급면적(SUPLY_AR: 주거전용+주거공용) × 3.3058, 만원 반올림.
 * 공급면적이 없거나, 원문 미확인 의심 공고이거나, 상한을 넘으면 null.
 */
export function pricePerPyeong(
  notice: { category: string; houseManageNo: string | null; rawJson: unknown },
  unit: { topAmount: number | null; rawJson: unknown },
): number | null {
  if (notice.category !== 'APT') return null;
  if (raw(notice.rawJson).RENT_SECD_NM !== '분양주택') return null;
  if (notice.houseManageNo && UNVERIFIED_AMOUNT_SUSPECTS.has(notice.houseManageNo)) return null;
  const supplyArea = Number(String(raw(unit.rawJson).SUPLY_AR ?? '').replace(/,/g, ''));
  if (!unit.topAmount || unit.topAmount <= 0 || !(supplyArea > 0)) return null;
  const pp = Math.round(unit.topAmount / sqmToPyeong(supplyArea));
  return pp <= MAX_PRICE_PER_PYEONG ? pp : null;
}
