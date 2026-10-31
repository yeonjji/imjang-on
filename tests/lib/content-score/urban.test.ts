import { describe, it, expect } from 'vitest';
import { sum } from '@/lib/content-score/core';
import { ownPark, weeklyPark } from '@/lib/content-score/park';
import { ownParking, weeklyParking, feeCompareShown } from '@/lib/content-score/parking';
import { ownCharger, weeklyCharger } from '@/lib/content-score/charger';

const allNear = { apts: true, subway: true, infra: true };

describe('공원(최대 10)', () => {
  it('전부 → 10, 좌표 없으면 지도 0', () => {
    const r = { parkType: '근린공원', area: 5000, designatedAt: new Date(), managingOrg: '구청', tel: '02', facilityPlay: '그네', facilitySport: null, facilityConvenience: null, facilityCulture: null };
    expect(sum(ownPark(r as never, true)) + sum(weeklyPark({ areaRank: true, ...allNear }))).toBe(10);
    expect(ownPark(r as never, false).map).toBe(0);
  });
});

describe('주차장(최대 11)', () => {
  const base = { prkplceSe: '공영', prkplceType: '노외', rdnmadr: 'r', lnmadr: 'l', institutionNm: 'i', insttNm: null, phoneNumber: '02', referenceDate: new Date(), metpay: '카드',
    chargeInfo: '유료', basicTime: 30, basicCharge: 1000, addUnitTime: null, addUnitCharge: null, dayCmmtkt: null, monthCmmtkt: null,
    weekdayOpenHhmm: '09:00', weekdayCloseHhmm: '18:00', satOpenHhmm: null, satCloseHhmm: null, holidayOpenHhmm: null, holidayCloseHhmm: null,
    pwdbsPpkZoneYn: true, enforceSe: null, feedingSe: null, spcmnt: null };
  it('전부 → 11', () => {
    expect(sum(ownParking(base as never, true)) + sum(weeklyParking({ feeCompare: true, ...allNear }))).toBe(11);
  });
  it('요금 정보 없음(빈 상태 카드) → 요금 0점', () => {
    expect(ownParking({ ...base, chargeInfo: '유료', basicTime: null, basicCharge: null } as never, true).fee).toBe(0);
    expect(ownParking({ ...base, chargeInfo: '무료', basicTime: null, basicCharge: null } as never, true).fee).toBe(2);
  });
  it('요금 비교: 비교 타일이 하나라도 있어야', () => {
    expect(feeCompareShown(null)).toBe(false);
    expect(feeCompareShown({ own30: 1000, median30: null, count30: 2, ownMonthly: null, medianMonthly: null, countMonthly: 0 })).toBe(false);
    expect(feeCompareShown({ own30: 1000, median30: 900, count30: 5, ownMonthly: null, medianMonthly: null, countMonthly: 0 })).toBe(true);
  });
});

describe('충전소(최대 11)', () => {
  const raw = { operatorName: '환경부', useTime: '24시간', parkingFree: true, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null };
  it('충전기 10대 이상·전부 → 11', () => {
    const units = Array.from({ length: 10 }, () => ({ outputKw: 50, installYear: 2020 }));
    expect(sum(ownCharger(raw, units, true)) + sum(weeklyCharger(allNear))).toBe(11);
  });
  it('충전기 없음 → 상태 표 0·깊이 0', () => {
    const b = ownCharger({ ...raw, operatorName: null }, [], false);
    expect(b.status).toBe(0);
    expect(b.depth).toBe(0);
    expect(b.operator).toBe(0);
  });
});
