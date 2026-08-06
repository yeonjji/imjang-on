import { describe, it, expect } from 'vitest';
import { formatHospitalTime } from '@/lib/hospital/utils';

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

  it('시·분 범위를 벗어난 원본값은 - 로 표기', () => {
    expect(formatHospitalTime(2500)).toBe('-');
    expect(formatHospitalTime(1270)).toBe('-');
    expect(formatHospitalTime(-100)).toBe('-');
  });

  it('자정 종료 표기 2400은 유지', () => {
    expect(formatHospitalTime(2400)).toBe('24:00');
  });
});
