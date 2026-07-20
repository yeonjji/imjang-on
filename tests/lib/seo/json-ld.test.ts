import { describe, it, expect } from 'vitest';
import { financialProductSchema } from '@/lib/seo/json-ld';

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
