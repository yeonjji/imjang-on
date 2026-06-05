import { describe, it, expect } from 'vitest';
import { parseFlexibleDate, parseScheduleRange } from '@/scripts/ingest/subscriptions/dates';

describe('parseFlexibleDate', () => {
  it('YYYY-MM-DD 를 UTC Date 로 파싱', () => {
    expect(parseFlexibleDate('2022-05-12')?.toISOString().slice(0, 10)).toBe('2022-05-12');
  });
  it('YYYYMMDD 를 파싱', () => {
    expect(parseFlexibleDate('20240118')?.toISOString().slice(0, 10)).toBe('2024-01-18');
  });
  it('YYYY.MM.DD 를 파싱', () => {
    expect(parseFlexibleDate('2023.06.09')?.toISOString().slice(0, 10)).toBe('2023-06-09');
  });
  it('빈 값·"-"·null 은 null', () => {
    expect(parseFlexibleDate('-')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
  });
  it('오타 포맷 "202306.29" 는 null (방어)', () => {
    expect(parseFlexibleDate('202306.29')).toBeNull();
  });
});

describe('parseScheduleRange', () => {
  it('일정 문자열의 시작·종료 날짜를 뽑는다', () => {
    const r = parseScheduleRange('2023.10.16 10:00 ~ 2023.10.17 17:00');
    expect(r.begin?.toISOString().slice(0, 10)).toBe('2023-10-16');
    expect(r.end?.toISOString().slice(0, 10)).toBe('2023-10-17');
  });
  it('빈 문자열은 begin/end 모두 null', () => {
    const r = parseScheduleRange('');
    expect(r.begin).toBeNull();
    expect(r.end).toBeNull();
  });
});
