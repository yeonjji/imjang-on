/**
 * 채택된 건물 → BuildingRegister 필드. 0은 '없음'이 아니라 미기재로 보는 필드(승강기·주차·건폐율 등)는 null.
 * 내진설계는 적용(1)인 주건축물 수만 센다 — 0은 미적용인지 미기재인지 구분할 수 없다(표본 실측).
 */
import type { Rec } from './select';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => {
  const n = Number(str(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const pos = (n: number) => (n > 0 ? n : null);
const date = (v: unknown) => {
  const s = str(v);
  return /^\d{8}$/.test(s) ? new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))) : null;
};
function mode(values: string[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of c) if (best === null || n > c.get(best)!) best = v;
  return best;
}
/** 컬럼 폭(VARCHAR)에 맞춰 자른다 — 넘치면 저장이 실패해 단지가 영영 숨는다. */
const cut = (v: string | null, max: number) => (v === null ? null : v.slice(0, max));
/** 건폐율은 100% 이하, 용적률은 DECIMAL(7,2) 범위 안만. 그 밖은 원자료 오류로 버린다. */
const rate = (v: number | null, max: number) => (v === null || v > max ? null : v);
const parking = (t: Rec) => num(t.indrAutoUtcnt) + num(t.oudrAutoUtcnt) + num(t.indrMechUtcnt) + num(t.oudrMechUtcnt);

export interface RegisterFields {
  useAprDate: Date | null;
  structure: string | null;
  mainPurpose: string | null;
  etcPurpose: string | null;
  groundFloors: number | null;
  undergroundFloors: number | null;
  mainBuildingCount: number;
  households: number | null;
  units: number | null;
  elevators: number | null;
  parkingTotal: number | null;
  bcRat: number | null;
  vlRat: number | null;
  seismicApplied: number;
  zoningKind: string | null;
  zoningName: string | null;
  hasNeighborhoodFacility: boolean;
  registerCreatedAt: Date | null;
}

export function normalizeRegister(sel: { recap: Rec | null; mains: Rec[] }, jijigu: Rec[], attached: Rec[]): RegisterFields {
  const { recap, mains } = sel;
  const sum = (f: (t: Rec) => number) => mains.reduce((s, t) => s + f(t), 0);
  const single = mains.length === 1 ? mains[0] : null;

  const mainPurpose = mode(mains.map((t) => str(t.mainPurpsCdNm)));
  const etcSource = mains.find((t) => str(t.mainPurpsCdNm) === mainPurpose);
  const useDates = mains.map((t) => date(t.useAprDay)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const repr = jijigu.find((j) => str(j.reprYn) === '1');
  const zoningName = repr ? str(repr.jijiguCdNm) || null : null;

  return {
    useAprDate: (recap && date(recap.useAprDay)) || useDates[0] || null,
    structure: cut(mode(mains.map((t) => str(t.strctCdNm))), 60),
    mainPurpose: cut(mainPurpose, 60),
    etcPurpose: cut(etcSource ? str(etcSource.etcPurps) || null : null, 300),
    groundFloors: pos(Math.max(0, ...mains.map((t) => num(t.grndFlrCnt)))),
    undergroundFloors: pos(Math.max(0, ...mains.map((t) => num(t.ugrndFlrCnt)))),
    mainBuildingCount: mains.length,
    households: pos(recap ? num(recap.hhldCnt) : 0) ?? pos(sum((t) => num(t.hhldCnt))),
    units: pos(recap ? num(recap.hoCnt) : 0) ?? pos(sum((t) => num(t.hoCnt))),
    elevators: pos(sum((t) => num(t.rideUseElvtCnt) + num(t.emgenUseElvtCnt))),
    parkingTotal: pos(recap ? num(recap.totPkngCnt) : 0) ?? pos(sum(parking) + attached.reduce((s, t) => s + parking(t), 0)),
    bcRat: rate(pos(recap ? num(recap.bcRat) : 0) ?? (single ? pos(num(single.bcRat)) : null), 100),
    vlRat: rate(pos(recap ? num(recap.vlRat) : 0) ?? (single ? pos(num(single.vlRat)) : null), 9999.99),
    seismicApplied: mains.filter((t) => str(t.rserthqkDsgnApplyYn) === '1').length,
    zoningKind: cut(zoningName && repr ? str(repr.jijiguGbCdNm).replace(/코드$/, '') || null : null, 20),
    zoningName: cut(zoningName, 60),
    hasNeighborhoodFacility: mains.some((t) => `${str(t.mainPurpsCdNm)} ${str(t.etcPurps)}`.includes('근린생활시설')),
    registerCreatedAt: mains.length ? date(mains[0].crtnDay) : null,
  };
}
