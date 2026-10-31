import { describe, it, expect } from 'vitest';
import { isCancelledDeal, withValidDeal, VALID_DEAL_WHERE } from '@/lib/transaction/valid-deal';

describe('isCancelledDeal', () => {
  it('해제 구분값 O 또는 해제일이 있으면 해제', () => {
    expect(isCancelledDeal({ cancelType: 'O', cancelDate: null })).toBe(true); // 해제일 없는 해제(운영 2,863건)
    expect(isCancelledDeal({ cancelType: null, cancelDate: new Date('2026-09-09') })).toBe(true);
    expect(isCancelledDeal({ cancelType: 'O', cancelDate: new Date('2026-09-09') })).toBe(true);
  });
  it('둘 다 없으면 유효', () => {
    expect(isCancelledDeal({ cancelType: null, cancelDate: null })).toBe(false);
    expect(isCancelledDeal({ cancelType: '', cancelDate: null })).toBe(false);
  });
});

describe('withValidDeal', () => {
  it('기존 조건을 그대로 두고 유효 거래 조건을 AND로 붙인다(OR 키 충돌 없음)', () => {
    const w = withValidDeal({ propertyId: 1n, OR: [{ floor: 1 }, { floor: 2 }] });
    expect(w).toEqual({ AND: [{ propertyId: 1n, OR: [{ floor: 1 }, { floor: 2 }] }, VALID_DEAL_WHERE] });
  });
});
