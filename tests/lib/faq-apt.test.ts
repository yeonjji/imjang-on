import { describe, it, expect } from 'vitest';
import { buildAptFaq } from '@/lib/faq/builders/apt';

describe('buildAptFaq 전세가율 반올림', () => {
  it('raw float를 정수%로(긴 소수 없음)', () => {
    const items = buildAptFaq({
      property: { name: '테스트아파트', region: { sido: '서울특별시' }, saleLastPrice: null, saleLastAt: null, saleAvgPrice12m: null, saleCount12m: 0 },
      areaSummary: [{ area: 84, jeonseRatioPct: 57.61439522661714 }],
      unifiedTotalCount: 10,
    });
    const ratioFaq = items.find((i) => i.q.includes('전세가율'));
    expect(ratioFaq).toBeDefined();
    expect(ratioFaq!.a).toContain('약 58%'); // 57.61 → 58
    expect(ratioFaq!.a).not.toMatch(/\d+\.\d{3,}/); // 긴 소수 금지
  });
});
