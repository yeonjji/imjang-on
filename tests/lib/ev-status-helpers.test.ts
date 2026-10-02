import { describe, it, expect } from 'vitest';
import { isValidStatId, mergeUnitStatuses } from '@/lib/urban/ev-status';

describe('isValidStatId', () => {
  it('영숫자 1~20자만 허용', () => {
    expect(isValidStatId('ME174001')).toBe(true);
    expect(isValidStatId('PI795111')).toBe(true);
    expect(isValidStatId('')).toBe(false);
    expect(isValidStatId('ME17 4001')).toBe(false);
    expect(isValidStatId('../etc')).toBe(false);
    expect(isValidStatId('A'.repeat(21))).toBe(false);
    expect(isValidStatId(null)).toBe(false);
  });
});

describe('mergeUnitStatuses', () => {
  const units = [
    { chgerId: '01', chgerType: '04', isFast: true },
    { chgerId: '02', chgerType: '02', isFast: false },
  ];

  it('충전기 번호로 상태를 붙이고, 없는 건 미확인', () => {
    const rows = mergeUnitStatuses(units, [{ chgerId: '01', stat: '2', statLabel: '사용가능', lastTsdt: null }]);
    expect(rows.map((r) => [r.chgerId, r.statLabel])).toEqual([
      ['01', '사용가능'],
      ['02', '미확인'],
    ]);
  });
});
