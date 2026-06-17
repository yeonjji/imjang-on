import { describe, it, expect } from 'vitest';
import { resolveLoanRegionScope } from '@/lib/loan/discovery';

describe('resolveLoanRegionScope', () => {
  it('전국 태그는 시도 없음 + 라벨 "전국"', () => {
    expect(resolveLoanRegionScope(['전국'])).toEqual({ specificSidos: [], label: '전국' });
  });

  it('단일 시도는 그대로', () => {
    expect(resolveLoanRegionScope(['강원'])).toEqual({ specificSidos: ['강원'], label: '강원' });
  });

  it('두 시도는 가운뎃점으로 결합', () => {
    expect(resolveLoanRegionScope(['경남', '울산'])).toEqual({
      specificSidos: ['경남', '울산'],
      label: '경남·울산',
    });
  });

  it('세 시도 이상은 "첫시도 외"로 절단', () => {
    const r = resolveLoanRegionScope(['서울', '경기', '인천']);
    expect(r.specificSidos).toEqual(['서울', '경기', '인천']);
    expect(r.label).toBe('서울 외');
  });

  it('전국(농어촌)은 시도가 아니므로 전국', () => {
    expect(resolveLoanRegionScope(['전국(농어촌)'])).toEqual({ specificSidos: [], label: '전국' });
  });

  it('전국+시도 혼합은 시도만 추린다', () => {
    expect(resolveLoanRegionScope(['전국', '강원'])).toEqual({ specificSidos: ['강원'], label: '강원' });
  });
});
