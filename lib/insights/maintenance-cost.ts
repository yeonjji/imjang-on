/**
 * 관리비 섹션 표시 모델. DB 행 → 화면 값. 순수 함수만 둔다(테스트 대상).
 *
 * 단지 간 비교는 공용관리비 ㎡당만 한다. 개별사용료는 단지마다 포함 항목이 다르다
 * (개별난방 단지는 난방비 0, 한전 직접 계약 단지는 전기 0 — 2026-10-15 실측).
 */
export interface MaintenanceMonth {
  yearMonth: string;
  labor: number | null; cleaning: number | null; guard: number | null; disinfection: number | null;
  elevator: number | null; homeNetwork: number | null; consignFee: number | null; repairs: number | null;
  commonEtc: number | null; commonTotal: number | null;
  heat: number | null; hotWater: number | null; gas: number | null; electricity: number | null;
  water: number | null; individualEtc: number | null;
  ltrLevy: number | null; ltrBalance: number | null; ltrRate: number | null;
  fetchedAt: Date;
}

export interface MaintenanceBasis {
  households: number | null;
  heatType: string | null;
  manageArea: number | null;
  sigunguName: string | null;
}

export interface SigunguStat {
  medianCommonPerM2: number;
  sampleCount: number;
}

export interface CostItem {
  label: string;
  amount: number;
}

export interface MaintenanceView {
  yearMonth: string;
  monthLabel: string;
  heatType: string | null;
  households: number | null;
  manageArea: number | null;
  /** true면 금액이 세대당 평균, false면 단지 전체(세대수 미상) */
  perHousehold: boolean;
  commonPerM2: number | null;
  commonAmount: number;
  comparison: { sigunguName: string; pct: number; label: '높음' | '낮음' | '비슷함'; sampleCount: number; medianPerM2: number } | null;
  totalAmount: number;
  commonItems: CostItem[];
  individualItems: CostItem[];
  individualTotal: number;
  barMax: number;
  trend: { label: string; perM2: number }[] | null;
  trendRangeLabel: string | null;
  seasonal: { winterLabel: string; summerLabel: string; rows: { label: string; winter: number; summer: number }[] } | null;
  individualHeating: boolean;
  ltr: { levy: number | null; levyPerHousehold: number | null; levyPerM2: number | null; balance: number | null; rate: number | null } | null;
  fetchedAt: Date;
}

const MIN_SAMPLE = 5;
const SIMILAR_PCT = 5;
const MIN_TREND = 3;

type AmountKey = Exclude<keyof MaintenanceMonth, 'yearMonth' | 'fetchedAt'>;
const COMMON_DEFS: [AmountKey, string][] = [
  ['labor', '인건비'], ['cleaning', '청소비'], ['guard', '경비비'], ['repairs', '수선·시설유지'],
  ['elevator', '승강기'], ['disinfection', '소독비'], ['consignFee', '위탁수수료'], ['homeNetwork', '홈네트워크'],
];
const INDIVIDUAL_DEFS: [AmountKey, string][] = [
  ['electricity', '전기'], ['water', '수도'], ['hotWater', '급탕'], ['heat', '난방'], ['gas', '가스'],
];
const INDIVIDUAL_KEYS: AmountKey[] = ['heat', 'hotWater', 'gas', 'electricity', 'water', 'individualEtc'];

export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 원 → "13억 1,241만 원" / "5,246만 원" */
export function manWon(n: number): string {
  const man = Math.round(n / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (eok === 0) return `${man.toLocaleString('ko-KR')}만 원`;
  return rest === 0 ? `${eok.toLocaleString('ko-KR')}억 원` : `${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만 원`;
}

export function monthLabel(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export function parseManageArea(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).kaptMarea;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function heatKind(t: string | null): 'shared' | 'individual' | 'other' {
  if (!t) return 'other';
  if (t.startsWith('개별')) return 'individual';
  if (t === '지역난방' || t === '중앙난방') return 'shared';
  return 'other';
}

const hasData = (m: MaintenanceMonth) => m.commonTotal !== null && m.commonTotal > 0;

export function buildMaintenanceView(
  months: MaintenanceMonth[],
  basis: MaintenanceBasis,
  stat: SigunguStat | null,
): MaintenanceView | null {
  const sorted = months.filter(hasData).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const latest = sorted.at(-1);
  if (!latest) return null;

  const hh = basis.households && basis.households > 0 ? basis.households : null;
  const area = basis.manageArea && basis.manageArea > 0 ? basis.manageArea : null;
  const per = (n: number) => Math.round(hh ? n / hh : n);

  const commonPerM2 = area ? Math.round(latest.commonTotal! / area) : null;

  let comparison: MaintenanceView['comparison'] = null;
  if (stat && stat.sampleCount >= MIN_SAMPLE && commonPerM2 !== null && basis.sigunguName) {
    const pct = Math.round((commonPerM2 / stat.medianCommonPerM2 - 1) * 100);
    comparison = {
      sigunguName: basis.sigunguName,
      pct,
      label: Math.abs(pct) < SIMILAR_PCT ? '비슷함' : pct > 0 ? '높음' : '낮음',
      sampleCount: stat.sampleCount,
      medianPerM2: stat.medianCommonPerM2,
    };
  }

  const items = (defs: [AmountKey, string][], etcKey: AmountKey): CostItem[] => {
    const main = defs
      .map(([k, label]) => ({ label, amount: per(latest[k] ?? 0) }))
      .filter((i) => i.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const etc = per(latest[etcKey] ?? 0);
    return etc > 0 ? [...main, { label: '기타', amount: etc }] : main;
  };
  const commonItems = items(COMMON_DEFS, 'commonEtc');
  const individualItems = items(INDIVIDUAL_DEFS, 'individualEtc');
  const individualRaw = INDIVIDUAL_KEYS.reduce((s, k) => s + (latest[k] ?? 0), 0);

  const trendMonths = area ? sorted.slice(-12) : [];
  const trend = trendMonths.length >= MIN_TREND
    ? trendMonths.map((m) => ({ label: `${Number(m.yearMonth.slice(4, 6))}월`, perM2: Math.round(m.commonTotal! / area!) }))
    : null;
  const trendRangeLabel = trend
    ? trendMonths[0].yearMonth.slice(0, 4) === latest.yearMonth.slice(0, 4)
      ? `${latest.yearMonth.slice(0, 4)}년`
      : `${monthLabel(trendMonths[0].yearMonth)} ~ ${monthLabel(latest.yearMonth)}`
    : null;

  const kind = heatKind(basis.heatType);
  let seasonal: MaintenanceView['seasonal'] = null;
  if (kind === 'shared') {
    const byYm = new Map(sorted.map((m) => [m.yearMonth, m]));
    const years = [...new Set(sorted.map((m) => m.yearMonth.slice(0, 4)))].sort().reverse();
    for (const y of years) {
      const w = byYm.get(`${y}01`);
      const s = byYm.get(`${y}08`) ?? byYm.get(`${y}07`);
      if (!w || !s) continue;
      const rows = ([['heat', '난방'], ['electricity', '전기'], ['hotWater', '급탕']] as [AmountKey, string][])
        .filter(([k]) => w[k] !== null && s[k] !== null && (w[k]! > 0 || s[k]! > 0))
        .map(([k, label]) => ({ label, winter: per(w[k]!), summer: per(s[k]!) }));
      if (rows.length > 0) seasonal = { winterLabel: monthLabel(w.yearMonth), summerLabel: monthLabel(s.yearMonth), rows };
      break;
    }
  }

  const ltr = latest.ltrLevy === null && latest.ltrBalance === null
    ? null
    : {
        levy: latest.ltrLevy,
        levyPerHousehold: latest.ltrLevy !== null && hh ? Math.round(latest.ltrLevy / hh) : null,
        levyPerM2: latest.ltrLevy !== null && area ? Math.round(latest.ltrLevy / area) : null,
        balance: latest.ltrBalance,
        rate: latest.ltrRate !== null && latest.ltrRate > 0 ? latest.ltrRate : null,
      };

  return {
    yearMonth: latest.yearMonth,
    monthLabel: monthLabel(latest.yearMonth),
    heatType: basis.heatType,
    households: hh,
    manageArea: area,
    perHousehold: hh !== null,
    commonPerM2,
    commonAmount: per(latest.commonTotal!),
    comparison,
    totalAmount: per(latest.commonTotal! + individualRaw + (latest.ltrLevy ?? 0)),
    commonItems,
    individualItems,
    individualTotal: per(individualRaw),
    barMax: Math.max(1, ...commonItems.map((i) => i.amount), ...individualItems.map((i) => i.amount)),
    trend,
    trendRangeLabel,
    seasonal,
    individualHeating: kind === 'individual',
    ltr,
    fetchedAt: latest.fetchedAt,
  };
}
