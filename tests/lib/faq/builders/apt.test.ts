import { describe, it, expect } from 'vitest';
import { buildAptFaq } from '@/lib/faq/builders/apt';

const base = {
  property: {
    name: '샘플아파트',
    region: { sido: '서울특별시' },
    saleLastPrice: 85000n, // 만원 → 8.5억
    saleLastAt: new Date('2026-06-15T00:00:00Z'),
    saleAvgPrice12m: 82000n, // 8.2억
    saleCount12m: 12,
  },
  areaSummary: [{ area: 25, jeonseRatioPct: 62 }],
  unifiedTotalCount: 340,
};

describe('buildAptFaq', () => {
  it('substitutes name + latest sale price(억) + date with MOLIT source', () => {
    const items = buildAptFaq(base);
    const q = items.find((i) => i.q.includes('최근 매매 실거래가'));
    expect(q).toBeDefined();
    expect(q!.a).toContain('8.5억');
    expect(q!.a).toContain('2026-06-15');
    expect(q!.source).toBe('국토교통부 실거래가 공개시스템');
  });

  it('omits sale-based Q&A when sale aggregates are null (non-indexed)', () => {
    const items = buildAptFaq({
      ...base,
      property: { ...base.property, saleLastPrice: null, saleLastAt: null, saleAvgPrice12m: null },
    });
    expect(items.some((i) => i.q.includes('최근 매매 실거래가'))).toBe(false);
    expect(items.some((i) => i.a.includes('국토교통부'))).toBe(true);
  });

  it('includes 전세가율 only when a matching area ratio exists', () => {
    expect(buildAptFaq(base).some((i) => i.q.includes('전세가율'))).toBe(true);
    const noRatio = buildAptFaq({ ...base, areaSummary: [{ area: 25, jeonseRatioPct: null }] });
    expect(noRatio.some((i) => i.q.includes('전세가율'))).toBe(false);
  });

  it('produces >= 2 dynamic items on an indexed apt', () => {
    expect(buildAptFaq(base).length).toBeGreaterThanOrEqual(2);
  });
});
