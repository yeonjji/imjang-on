import { describe, it, expect } from 'vitest';
import { formatLoanRate } from '@/lib/loan/rate';

describe('formatLoanRate', () => {
  it('순수 숫자·범위형에는 % 를 붙인다(원천 정의: 금리(연, %))', () => {
    expect(formatLoanRate('3.47')).toBe('3.47%');
    expect(formatLoanRate('2.1~2.9')).toBe('2.1~2.9%');
    expect(formatLoanRate(' ~19.99 ')).toBe('~19.99%');
    expect(formatLoanRate('0')).toBe('0%');
  });

  it('설명·단위가 들어간 값은 원문 그대로 둔다', () => {
    expect(formatLoanRate('은행금리-1.8')).toBe('은행금리-1.8');
    expect(formatLoanRate('기준금리 + 2.5')).toBe('기준금리 + 2.5');
    expect(formatLoanRate('연 2.0%~3.3%')).toBe('연 2.0%~3.3%');
    expect(formatLoanRate('은행별 상이')).toBe('은행별 상이');
  });

  it('HTML 엔티티를 푼다', () => {
    expect(formatLoanRate('&#40;보증금&#41;연1.3%')).toBe('(보증금)연1.3%');
  });
});
