import { describe, it, expect } from 'vitest';
import {
  parseMarketDays,
  marketDaysShort,
  marketDaysLong,
  splitProducts,
  marketAgeYears,
  buildMarketHeroLine,
} from '@/lib/amenity/market-display';

describe('parseMarketDays', () => {
  it('4일+9일 → 끝자리 4·9인 날', () => {
    expect(parseMarketDays('4일+9일')).toEqual({
      kind: 'monthly',
      cycle: [4, 9],
      days: [4, 9, 14, 19, 24, 29],
    });
  });

  it('5일+10일 → 끝자리 5·0인 날', () => {
    const d = parseMarketDays('5일+10일');
    expect(d).toEqual({ kind: 'monthly', cycle: [5, 10], days: [5, 10, 15, 20, 25, 30] });
  });

  it('1일+6일은 31일을 포함한다', () => {
    const d = parseMarketDays('1일+6일');
    expect(d && d.kind === 'monthly' && d.days).toEqual([1, 6, 11, 16, 21, 26, 31]);
  });

  it('공백은 무시한다', () => {
    expect(parseMarketDays(' 2일 + 7일 ')).toMatchObject({ kind: 'monthly', cycle: [2, 7] });
  });

  it('매일 → daily', () => {
    expect(parseMarketDays('매일')).toEqual({ kind: 'daily' });
  });

  it('낯선 형식은 원문(raw)으로 남긴다', () => {
    expect(parseMarketDays('상설')).toEqual({ kind: 'raw', text: '상설' });
    expect(parseMarketDays('15일')).toEqual({ kind: 'raw', text: '15일' });
    expect(parseMarketDays('매일+5일장')).toEqual({ kind: 'raw', text: '매일+5일장' });
  });

  it('빈 값은 null', () => {
    expect(parseMarketDays('')).toBeNull();
    expect(parseMarketDays('  ')).toBeNull();
    expect(parseMarketDays(null)).toBeNull();
    expect(parseMarketDays(undefined)).toBeNull();
  });
});

describe('marketDaysShort / marketDaysLong', () => {
  it('monthly', () => {
    const d = parseMarketDays('4일+9일')!;
    expect(marketDaysShort(d)).toBe('4·9일장');
    expect(marketDaysLong(d)).toBe('매월 4·9·14·19·24·29일');
  });
  it('daily', () => {
    const d = parseMarketDays('매일')!;
    expect(marketDaysShort(d)).toBe('매일');
    expect(marketDaysLong(d)).toBe('매일 개장');
  });
  it('raw', () => {
    const d = parseMarketDays('상설')!;
    expect(marketDaysShort(d)).toBe('상설');
    expect(marketDaysLong(d)).toBe('상설');
  });
});

describe('splitProducts', () => {
  it('+로 나누고 공백·빈 항목·중복을 정리한다', () => {
    expect(splitProducts('농산물+축산물++ 수산물+농산물+')).toEqual(['농산물', '축산물', '수산물']);
  });
  it('빈 값은 빈 배열', () => {
    expect(splitProducts(null)).toEqual([]);
    expect(splitProducts('')).toEqual([]);
  });
});

describe('marketAgeYears', () => {
  it('개설 햇수', () => {
    expect(marketAgeYears(1955, 2026)).toBe(71);
  });
  it('없거나 미래 연도면 null', () => {
    expect(marketAgeYears(null, 2026)).toBeNull();
    expect(marketAgeYears(2030, 2026)).toBeNull();
  });
});

describe('buildMarketHeroLine', () => {
  it('세 요소를 모두 잇는다', () => {
    expect(buildMarketHeroLine({ establishedYear: 1955, storeCount: 64, openCycle: '4일+9일' }))
      .toBe('1955년 개설 · 점포 64곳 · 4·9일 장날');
  });
  it('매일장은 매일 개장', () => {
    expect(buildMarketHeroLine({ establishedYear: 1978, storeCount: 62, openCycle: '매일' }))
      .toBe('1978년 개설 · 점포 62곳 · 매일 개장');
  });
  it('낯선 주기는 빼고, 점포 수는 천 단위 구분', () => {
    expect(buildMarketHeroLine({ storeCount: 5111, openCycle: '상설' })).toBe('점포 5,111곳');
  });
  it('아무 값도 없으면 null', () => {
    expect(buildMarketHeroLine({})).toBeNull();
  });
});
