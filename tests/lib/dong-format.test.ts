import { describe, it, expect } from 'vitest';
import { formatDongDate, formatDongPrice, formatDongMeta } from '@/lib/transaction/dong-format';

describe('formatDongDate — 연도를 반드시 포함한다', () => {
  it('YY.MM.DD로 쓴다', () => {
    expect(formatDongDate('2026-09-09')).toBe('26.09.09');
  });
  it('몇 년 전 거래도 연도로 구분된다', () => {
    expect(formatDongDate('2019-03-04')).toBe('19.03.04');
  });
  it('한 자리 월·일을 0으로 채운다', () => {
    expect(formatDongDate('2026-01-02')).toBe('26.01.02');
  });
});

// 바로 위 섹션(unified-transaction-table.tsx:25-31)과 같은 표기를 쓴다.
// formatBillion 실측: 95000 → '9.5억', 8000 → '8,000만원', 290000 → '29억'
describe('formatDongPrice — 인접 섹션과 같은 표기', () => {
  it('매매는 거래가', () => {
    expect(formatDongPrice({ dealType: 'SALE', dealAmount: 95000, deposit: null, monthlyRent: null }))
      .toBe('9.5억');
  });
  it('전세는 보증금', () => {
    expect(formatDongPrice({ dealType: 'JEONSE', dealAmount: null, deposit: 95000, monthlyRent: null }))
      .toBe('9.5억');
  });
  it('월세는 보증금과 월세를 라벨과 함께 쓴다', () => {
    expect(formatDongPrice({ dealType: 'WOLSE', dealAmount: null, deposit: 5000, monthlyRent: 150 }))
      .toBe('보 5,000만원 / 월 150만');
  });
  it('월세 축약(5,000/150)을 쓰지 않는다', () => {
    const out = formatDongPrice({ dealType: 'WOLSE', dealAmount: null, deposit: 5000, monthlyRent: 150 });
    expect(out).toContain('보 ');
    expect(out).toContain('월 ');
  });
  it('억 미만은 만원으로만 쓴다', () => {
    expect(formatDongPrice({ dealType: 'JEONSE', dealAmount: null, deposit: 8000, monthlyRent: null }))
      .toBe('8,000만원');
  });
  it('금액이 없으면 빈 문자열', () => {
    expect(formatDongPrice({ dealType: 'SALE', dealAmount: null, deposit: null, monthlyRent: null })).toBe('');
  });
});

describe('formatDongMeta — 면적 · 층 · 날짜', () => {
  it('셋을 가운뎃점으로 잇는다', () => {
    expect(formatDongMeta({ exclusiveArea: 84.12, floor: 11, contractDate: '2026-09-09' }))
      .toBe('84㎡ · 11층 · 26.09.09');
  });
  it('층이 없으면 그 조각을 생략한다 — —를 찍지 않는다', () => {
    const out = formatDongMeta({ exclusiveArea: 59.9, floor: null, contractDate: '2026-09-09' });
    expect(out).toBe('60㎡ · 26.09.09');
    expect(out).not.toContain('—');
  });
  it('면적은 반올림한 정수로 쓴다', () => {
    expect(formatDongMeta({ exclusiveArea: 84.97, floor: 3, contractDate: '2026-01-02' }))
      .toBe('85㎡ · 3층 · 26.01.02');
  });
});
