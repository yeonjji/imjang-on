import { describe, it, expect } from 'vitest';
import { isHighSchool, schoolOpenYears, formatYmd, formatMonthDay } from '@/lib/school-display';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('isHighSchool', () => {
  it('고등학교만 true', () => {
    expect(isHighSchool('고등학교')).toBe(true);
    expect(isHighSchool('초등학교')).toBe(false);
    expect(isHighSchool('특수학교')).toBe(false);
    expect(isHighSchool(null)).toBe(false);
  });
});

describe('schoolOpenYears', () => {
  it('개교 햇수', () => {
    expect(schoolOpenYears(d('1989-04-28'), 2026)).toBe(37);
  });
  it('올해 개교는 0, 미래·없음은 null', () => {
    expect(schoolOpenYears(d('2026-03-02'), 2026)).toBe(0);
    expect(schoolOpenYears(d('2027-03-02'), 2026)).toBeNull();
    expect(schoolOpenYears(null, 2026)).toBeNull();
  });
});

describe('formatYmd / formatMonthDay', () => {
  it('날짜 표기', () => {
    expect(formatYmd(d('1988-12-23'))).toBe('1988-12-23');
    expect(formatMonthDay(d('1989-04-28'))).toBe('4월 28일');
  });
  it('없으면 null', () => {
    expect(formatYmd(null)).toBeNull();
    expect(formatMonthDay(undefined)).toBeNull();
  });
});
