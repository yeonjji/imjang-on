import { describe, it, expect } from 'vitest';
import { buildLoanFaq } from '@/lib/faq/builders/loan';

const base = {
  finprdnm: '샘플대출',
  lnlmt: 5000, // 만원
  irt: '연 2.0%~3.3%',
  ofrinstnm: '서울시',
  targetTags: ['청년', '무주택'],
  updatedAt: new Date('2026-07-15T00:00:00Z'),
};

describe('buildLoanFaq', () => {
  it('substitutes 한도(만원)/금리 with KINFA source', () => {
    const q = buildLoanFaq(base).find((i) => i.q.includes('대출한도'));
    expect(q!.a).toContain('5,000만원');
    expect(q!.a).toContain('2.0%~3.3%');
    expect(q!.source).toBe('서민금융진흥원');
  });

  it('always includes 기준일 (formatAsOf) and yields >= 2 with 한도', () => {
    const items = buildLoanFaq(base);
    expect(items.find((i) => i.q.includes('기준 자료'))!.a).toContain('2026.07.15');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('omits 한도·금리 item when both lnlmt and irt are absent', () => {
    const items = buildLoanFaq({ ...base, lnlmt: null, irt: null });
    expect(items.some((i) => i.q.includes('대출한도'))).toBe(false);
  });
});
