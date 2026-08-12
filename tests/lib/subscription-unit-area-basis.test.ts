import { describe, it, expect } from 'vitest';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';

describe('unitAreaBasis', () => {
  it('SUPLY_AR이 있으면 공급면적', () => {
    expect(unitAreaBasis({ SUPLY_AR: '82.8550' })).toBe('supply');
  });
  it('SUPLY_AR이 없고 EXCLUSE_AR만 있으면 전용면적', () => {
    expect(unitAreaBasis({ EXCLUSE_AR: '59.9900' })).toBe('exclusive');
  });
  it('둘 다 있으면 어댑터와 같이 SUPLY_AR을 택한다', () => {
    expect(unitAreaBasis({ SUPLY_AR: '82.85', EXCLUSE_AR: '59.99' })).toBe('supply');
  });
  it('둘 다 없으면 null', () => {
    expect(unitAreaBasis({ HOUSE_TY: '84A' })).toBeNull();
    expect(unitAreaBasis(null)).toBeNull();
  });
  it('빈 문자열은 값 없음으로 본다', () => {
    expect(unitAreaBasis({ SUPLY_AR: '', EXCLUSE_AR: '59.99' })).toBe('exclusive');
  });
  it('라벨', () => {
    expect(areaBasisLabel('supply')).toBe('공급');
    expect(areaBasisLabel('exclusive')).toBe('전용');
    expect(areaBasisLabel(null)).toBe('');
  });
});
