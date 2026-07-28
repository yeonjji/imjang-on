import { describe, it, expect } from 'vitest';
import { financialProductSchema, residenceSchema, placeSchema } from '@/lib/seo/json-ld';

describe('financialProductSchema', () => {
  it('builds a LoanOrCredit with provider Organization and MonetaryAmount', () => {
    const s = financialProductSchema({
      type: 'LoanOrCredit',
      name: '샘플대출',
      url: 'https://x/finance/1',
      providerName: '서민금융진흥원',
      amount: { currency: 'KRW', value: 50_000_000 },
    }) as Record<string, unknown>;
    expect(s['@type']).toBe('LoanOrCredit');
    expect(s.name).toBe('샘플대출');
    expect(s.provider).toEqual({ '@type': 'Organization', name: '서민금융진흥원' });
    expect(s.amount).toEqual({ '@type': 'MonetaryAmount', currency: 'KRW', value: 50_000_000 });
  });

  it('omits amount and fees when not provided', () => {
    const s = financialProductSchema({
      type: 'FinancialProduct',
      name: 'x',
      url: 'u',
      providerName: 'p',
    }) as Record<string, unknown>;
    expect(s.amount).toBeUndefined();
    expect(s.feesAndCommissionsSpecification).toBeUndefined();
  });

  it('includes feesAndCommissionsSpecification when provided', () => {
    const s = financialProductSchema({
      type: 'FinancialProduct',
      name: 'x',
      url: 'u',
      providerName: 'p',
      feesAndCommissions: '연 0.05%~',
    }) as Record<string, unknown>;
    expect(s.feesAndCommissionsSpecification).toBe('연 0.05%~');
  });
});

describe('residenceSchema address', () => {
  it('주소가 확정되면 streetAddress + addressRegion + addressLocality를 모두 낸다', () => {
    const s = residenceSchema({
      name: '헬리오시티',
      address: '가락동 913',
      addressRegion: '서울특별시',
      addressLocality: '송파구',
      url: 'https://x/apt/1',
    }) as Record<string, unknown>;
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'KR',
      addressRegion: '서울특별시',
      addressLocality: '송파구',
      streetAddress: '가락동 913',
    });
  });

  it('주소가 확정되지 않으면 streetAddress 속성 자체를 생략한다', () => {
    const s = residenceSchema({
      name: '포레나루원시티',
      addressRegion: '인천광역시',
      addressLocality: '서구',
      url: 'https://x/apt/2',
    }) as Record<string, unknown>;
    const addr = s.address as Record<string, unknown>;
    // undefined 통과를 막기 위해 키 존재 자체를 검사한다.
    expect('streetAddress' in addr).toBe(false);
    expect(addr.addressRegion).toBe('인천광역시');
    expect(addr.addressLocality).toBe('서구');
  });
});

describe('placeSchema 회귀 (공용 postalAddress 변경 방어)', () => {
  it('addressRegion/addressLocality를 주지 않으면 기존과 동일한 출력', () => {
    const s = placeSchema({
      type: 'Hospital',
      name: '서울대병원',
      address: '서울특별시 종로구 대학로 101',
      url: 'https://x/medical/hospital/11110/1',
    }) as Record<string, unknown>;
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'KR',
      streetAddress: '서울특별시 종로구 대학로 101',
    });
  });
});
