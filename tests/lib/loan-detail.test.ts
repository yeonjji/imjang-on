import { describe, it, expect } from 'vitest';
import { formatLoanValue, decodeEntities, isPlausibleValue } from '@/lib/loan/detail';

describe('decodeEntities', () => {
  it('HTML 엔티티를 디코딩한다', () => {
    expect(decodeEntities('원&#40;리&#41;금')).toBe('원(리)금');
    expect(decodeEntities('A&amp;B &lt;x&gt;')).toBe('A&B <x>');
  });
});

describe('formatLoanValue', () => {
  it('순수 숫자형(범위·소수 포함)에만 단위를 붙인다', () => {
    expect(formatLoanValue('8', '년')).toBe('8년');
    expect(formatLoanValue('1~5', '년')).toBe('1~5년');
    expect(formatLoanValue('0.5', '년')).toBe('0.5년');
  });
  it('이미 단위/설명이 든 값은 그대로 두고 디코딩만 한다', () => {
    expect(formatLoanValue('2년', '년')).toBe('2년');
    expect(formatLoanValue('6개월', '년')).toBe('6개월');
    expect(formatLoanValue('은행별 상이', '년')).toBe('은행별 상이');
    expect(formatLoanValue('원&#40;리&#41;금', undefined)).toBe('원(리)금');
  });
});

describe('isPlausibleValue', () => {
  it('연 단위 순수 숫자형에서 50년 초과는 비현실값으로 본다', () => {
    expect(isPlausibleValue('10, 15, 20, 309, 14, 19, 29', '년')).toBe(false);
    expect(isPlausibleValue('309', '년')).toBe(false);
  });
  it('정상 범위·텍스트·비(非)연단위는 통과시킨다', () => {
    expect(isPlausibleValue('5~30', '년')).toBe(true);
    expect(isPlausibleValue('2,3', '년')).toBe(true);
    expect(isPlausibleValue('5(최대 60개월, 보증기간 이내)', '년')).toBe(true); // 텍스트라 판단 안 함
    expect(isPlausibleValue('9% 이내', undefined)).toBe(true);
  });
});
