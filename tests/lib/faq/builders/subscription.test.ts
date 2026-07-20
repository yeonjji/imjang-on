import { describe, it, expect } from 'vitest';
import { buildSubscriptionFaq } from '@/lib/faq/builders/subscription';

const base = {
  name: '샘플단지',
  regionName: '서울 강남구',
  totalSupply: 500,
  receiptBegin: new Date('2026-08-01T00:00:00Z'),
  receiptEnd: new Date('2026-08-05T00:00:00Z'),
  category: 'APT' as const,
  moveInYm: '202812',
  unitCount: 3,
};

describe('buildSubscriptionFaq', () => {
  it('always yields >= 2 dynamic items, all tagged 청약홈', () => {
    const items = buildSubscriptionFaq(base);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.source === '한국부동산원 청약홈')).toBe(true);
  });

  it('substitutes the receipt period into the schedule Q&A', () => {
    const q = buildSubscriptionFaq(base).find((i) => i.q.includes('접수 일정'));
    expect(q!.a).toContain('08.01~08.05');
  });

  it('omits the 세대수 Q&A when totalSupply is null (still >= 2)', () => {
    const items = buildSubscriptionFaq({ ...base, totalSupply: null });
    expect(items.some((i) => i.q.includes('공급 세대수'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
