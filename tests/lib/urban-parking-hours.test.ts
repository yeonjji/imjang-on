import { describe, it, expect } from 'vitest';
import { formatHourRange, isOpen24, isAllDayOpen24 } from '@/lib/urban/parking-hours';

describe('formatHourRange', () => {
  it('returns "24시간 운영" for 0000-2400', () => {
    expect(formatHourRange('0000', '2400')).toBe('24시간 운영');
  });
  it('returns "HH:MM ~ HH:MM" for normal range', () => {
    expect(formatHourRange('0600', '2200')).toBe('06:00 ~ 22:00');
  });
  it('returns null when either side is null', () => {
    expect(formatHourRange(null, '2200')).toBeNull();
    expect(formatHourRange('0600', null)).toBeNull();
    expect(formatHourRange(null, null)).toBeNull();
  });
  it('returns null for malformed hhmm', () => {
    expect(formatHourRange('abcd', '1200')).toBeNull();
    expect(formatHourRange('25', '99')).toBeNull();
  });
});

describe('isOpen24', () => {
  it('true when both are 0000 and 2400', () => {
    expect(isOpen24('0000', '2400')).toBe(true);
  });
  it('false otherwise', () => {
    expect(isOpen24('0600', '2400')).toBe(false);
    expect(isOpen24('0000', '2200')).toBe(false);
    expect(isOpen24(null, null)).toBe(false);
  });
});

describe('isAllDayOpen24', () => {
  it('true when weekday/sat/holiday all 0000-2400', () => {
    expect(isAllDayOpen24({
      weekdayOpen: '0000', weekdayClose: '2400',
      satOpen: '0000', satClose: '2400',
      holidayOpen: '0000', holidayClose: '2400',
    })).toBe(true);
  });
  it('false when weekday only', () => {
    expect(isAllDayOpen24({
      weekdayOpen: '0000', weekdayClose: '2400',
      satOpen: '0900', satClose: '1800',
      holidayOpen: null, holidayClose: null,
    })).toBe(false);
  });
});
