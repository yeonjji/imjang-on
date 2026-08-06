import { describe, it, expect } from 'vitest';
import { formatHospitalTime, formatHospitalHours } from '@/lib/hospital/utils';

describe('formatHospitalTime', () => {
  it('4자리 숫자를 HH:MM 형식으로 변환', () => {
    expect(formatHospitalTime(830)).toBe('08:30');
    expect(formatHospitalTime(1730)).toBe('17:30');
    expect(formatHospitalTime(1200)).toBe('12:00');
    expect(formatHospitalTime(0)).toBe('00:00');
    expect(formatHospitalTime(900)).toBe('09:00');
  });

  it('null을 휴진으로 변환', () => {
    expect(formatHospitalTime(null)).toBe('휴진');
  });

  it('undefined를 휴진으로 변환', () => {
    expect(formatHospitalTime(undefined)).toBe('휴진');
  });
});

describe('formatHospitalHours', () => {
  it('정상 구간은 "HH:MM ~ HH:MM"으로 표기', () => {
    expect(formatHospitalHours(830, 1800)).toBe('08:30 ~ 18:00');
  });

  it('종료가 시작보다 이르거나 같으면 null (예: 08:30~06:00 모순값)', () => {
    expect(formatHospitalHours(830, 600)).toBeNull();
    expect(formatHospitalHours(900, 900)).toBeNull();
  });

  it('HHMM 범위를 벗어난 값은 null', () => {
    expect(formatHospitalHours(900, 9999)).toBeNull();
    expect(formatHospitalHours(900, 1870)).toBeNull(); // 분 ≥ 60
    expect(formatHospitalHours(-100, 1800)).toBeNull();
  });

  it('한쪽이라도 없으면 null (한쪽만 있는 값으로 진료시간을 단정하지 않는다)', () => {
    expect(formatHospitalHours(900, null)).toBeNull();
    expect(formatHospitalHours(null, 1800)).toBeNull();
    expect(formatHospitalHours(null, null)).toBeNull();
  });
});
