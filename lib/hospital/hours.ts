// 병원 진료시간의 표시 우선순위(스펙 2026-10-27 1안): 심평원 14칸 중 하나라도 값이 있으면 심평원만,
// 없으면 국립중앙의료원. 화면(탭·카드·FAQ)은 effectiveHours, 집계 SQL은 effectiveHoursJoin — 같은 규칙.
import { Prisma, type HospitalDetail, type HospitalNemcHours } from '@prisma/client';
import { formatHospitalHours } from './utils';

const WEEK = [
  ['월', 'Mon'], ['화', 'Tue'], ['수', 'Wed'], ['목', 'Thu'], ['금', 'Fri'], ['토', 'Sat'], ['일', 'Sun'],
] as const;
// Date#getDay() 0=일 … 6=토
const JS_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Week = Pick<HospitalDetail,
  'openMon' | 'closeMon' | 'openTue' | 'closeTue' | 'openWed' | 'closeWed' | 'openThu' | 'closeThu' |
  'openFri' | 'closeFri' | 'openSat' | 'closeSat' | 'openSun' | 'closeSun'>;

export interface DayHours { label: string; hours: string }
export interface EffectiveHours {
  source: 'hira' | 'nemc';
  days: DayHours[];
  at: (jsDay: number) => string | null;
  monday: string | null;
  note: string | null;
  fetchedAt: Date | null;
}

export type HoursView = Omit<EffectiveHours, 'at'>;

export function hiraHasHours(d: Week | null): boolean {
  if (!d) return false;
  return WEEK.some(([, s]) => d[`open${s}`] != null || d[`close${s}`] != null);
}

function build(w: Week, extra: DayHours[]) {
  const fmt = (s: (typeof WEEK)[number][1]) => formatHospitalHours(w[`open${s}`], w[`close${s}`]);
  const days = WEEK.map(([label, s]): { label: string; hours: string | null } => ({ label, hours: fmt(s) }))
    .filter((d): d is DayHours => d.hours != null)
    .concat(extra);
  return { days, at: (jsDay: number) => fmt(JS_DAY[jsDay]), monday: fmt('Mon') };
}

export function effectiveHours(detail: Week | null, nemc: HospitalNemcHours | null): EffectiveHours | null {
  if (hiraHasHours(detail)) {
    return { source: 'hira', ...build(detail!, []), note: null, fetchedAt: null };
  }
  if (!nemc) return null;
  const hol = formatHospitalHours(nemc.openHol, nemc.closeHol);
  const b = build(nemc, hol ? [{ label: '공휴일', hours: hol }] : []);
  if (b.days.length === 0 && !nemc.note) return null;
  return { source: 'nemc', ...b, note: nemc.note, fetchedAt: nemc.fetchedAt };
}

const COLS = WEEK.flatMap(([, s]) => [`open${s}`, `close${s}`]);

/**
 * 집계 SQL용: `${effectiveHoursJoin('x')}` 뒤에서 e."openSat" 등을 쓴다. 규칙은 effectiveHours와 같다.
 * hospitalAlias는 코드 상수만 넘긴다(사용자 입력 금지).
 */
export function effectiveHoursJoin(hospitalAlias: 'x' | 'h'): Prisma.Sql {
  const anyHira = COLS.map((c) => `d."${c}"`).join(', ');
  const pick = COLS.map((c) => `CASE WHEN COALESCE(${anyHira}) IS NOT NULL THEN d."${c}" ELSE n."${c}" END AS "${c}"`).join(',\n      ');
  return Prisma.raw(`
    LEFT JOIN "HospitalDetail" d ON d."hospitalId" = ${hospitalAlias}.id
    LEFT JOIN "HospitalNemcHours" n ON n."hospitalId" = ${hospitalAlias}.id
    CROSS JOIN LATERAL (SELECT
      ${pick}) e`);
}
