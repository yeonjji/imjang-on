import { describe, it, expect } from 'vitest';
import { normalizeFees } from '@/lib/urban/parking-fees';

describe('normalizeFees', () => {
  it('returns { free: true } when chargeInfo is 무료', () => {
    expect(normalizeFees({ chargeInfo: '무료', basicCharge: 500, basicTime: 30, addUnitCharge: 200, addUnitTime: 10, dayCmmtkt: null, monthCmmtkt: null }))
      .toEqual({ free: true, items: [] });
  });
  it('returns paid items when chargeInfo is 유료', () => {
    const r = normalizeFees({ chargeInfo: '유료', basicCharge: 500, basicTime: 30, addUnitCharge: 200, addUnitTime: 10, dayCmmtkt: 10000, monthCmmtkt: 80000 });
    expect(r.free).toBe(false);
    expect(r.items).toEqual([
      { label: '기본요금', value: '30분 500원' },
      { label: '추가단위', value: '10분 200원' },
      { label: '1일권', value: '10,000원' },
      { label: '월정기', value: '80,000원' },
    ]);
  });
  it('skips items whose pair is incomplete', () => {
    const r = normalizeFees({ chargeInfo: '유료', basicCharge: 500, basicTime: null, addUnitCharge: null, addUnitTime: 10, dayCmmtkt: 0, monthCmmtkt: null });
    expect(r.items).toEqual([]);
  });
  it('chargeInfo null with all-null fees → free:false, items 0', () => {
    const r = normalizeFees({ chargeInfo: null, basicCharge: null, basicTime: null, addUnitCharge: null, addUnitTime: null, dayCmmtkt: null, monthCmmtkt: null });
    expect(r.free).toBe(false);
    expect(r.items).toEqual([]);
  });
});
