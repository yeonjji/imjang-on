import { describe, it, expect } from 'vitest';
import { isRentalNotice, supplyAmountLabel } from '@/lib/subscription/rental';

describe('isRentalNotice', () => {
  it('APT 분양주택은 임대가 아니다', () => {
    expect(isRentalNotice('APT', { RENT_SECD_NM: '분양주택' })).toBe(false);
  });
  it('APT 분양전환 가능·불가 임대는 임대다', () => {
    expect(isRentalNotice('APT', { RENT_SECD_NM: '분양전환 가능임대' })).toBe(true);
    expect(isRentalNotice('APT', { RENT_SECD_NM: '분양전환 불가임대' })).toBe(true);
  });
  it('공공지원민간임대는 항상 임대다', () => {
    expect(isRentalNotice('PUB_PRIV_RENT', {})).toBe(true);
  });
  it('오피스텔등 중 민간임대만 임대다', () => {
    expect(isRentalNotice('OFFICETEL_ETC', { HOUSE_DTL_SECD_NM: '민간임대' })).toBe(true);
    expect(isRentalNotice('OFFICETEL_ETC', { HOUSE_DTL_SECD_NM: '오피스텔' })).toBe(false);
  });
  it('구분 정보가 없는 유형·값은 임대로 보지 않는다', () => {
    expect(isRentalNotice('REMNANT', {})).toBe(false);
    expect(isRentalNotice('ARBITRARY', null)).toBe(false);
    expect(isRentalNotice('APT', null)).toBe(false);
  });
});

describe('supplyAmountLabel', () => {
  it('임대는 청약홈 표기(공급금액), 그 외는 분양가', () => {
    expect(supplyAmountLabel(true)).toBe('공급금액');
    expect(supplyAmountLabel(false)).toBe('분양가');
  });
});
