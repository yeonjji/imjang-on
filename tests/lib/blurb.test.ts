import { describe, it, expect } from 'vitest';
import { salePriceTrend, propertyBlurb, type PropertyBlurbInput } from '@/lib/seo/blurb';

describe('salePriceTrend', () => {
  it('up when recent avg > earlier avg by >3%', () => {
    const pts = [
      { month: '2025-01', avg: 50000 }, { month: '2025-02', avg: 50000 }, { month: '2025-03', avg: 50000 },
      { month: '2025-10', avg: 55000 }, { month: '2025-11', avg: 56000 }, { month: '2025-12', avg: 57000 },
    ];
    expect(salePriceTrend(pts)).toBe('up');
  });
  it('flat within ±3%', () => {
    const pts = [
      { month: '2025-01', avg: 50000 }, { month: '2025-02', avg: 50000 }, { month: '2025-03', avg: 50000 },
      { month: '2025-10', avg: 50500 }, { month: '2025-11', avg: 50000 }, { month: '2025-12', avg: 50200 },
    ];
    expect(salePriceTrend(pts)).toBe('flat');
  });
  it('null when too few points', () => {
    expect(salePriceTrend([{ month: '2025-12', avg: 50000 }])).toBeNull();
  });
});

const base: PropertyBlurbInput = {
  name: '래미안',
  regionFullName: '서울특별시 송파구',
  builtYear: 2020,
  households: 1200,
  txCount12m: 50,
  saleCount12m: 30,
  jeonseCount12m: 20,
  saleAvgPrice12m: 68000,
  jeonseAvgDeposit12m: 42000,
  trend: 'up',
  subwayCount: 1,
  infra: [{ label: '학교', count: 6 }, { label: '병원', count: 12 }],
};

describe('propertyBlurb', () => {
  it('활발 거래 + 상승 + 인프라 + 조사', () => {
    const s = propertyBlurb(base);
    expect(s).toContain('래미안은'); // 받침 → 은
    expect(s).toContain('서울특별시 송파구');
    expect(s).toContain('2020년 준공');
    expect(s).toContain('활발하게 거래');
    expect(s).toContain('상승');
    expect(s).toContain('지하철 1개역');
    expect(s).toContain('학교 6곳');
  });
  it('거래 적은 단지: 드물었으며 + 전세 문장 생략', () => {
    const s = propertyBlurb({ ...base, txCount12m: 2, saleCount12m: 2, jeonseCount12m: 0, jeonseAvgDeposit12m: null });
    expect(s).toContain('거래가 드물었으며');
    expect(s).not.toContain('전세 평균');
  });
  it('전세가율 70%+ 강조 문장', () => {
    const s = propertyBlurb({ ...base, saleAvgPrice12m: 50000, jeonseAvgDeposit12m: 40000 });
    expect(s).toContain('전세 수요가 강한');
  });
  it('인프라 없으면 인프라 문장 생략', () => {
    const s = propertyBlurb({ ...base, subwayCount: 0, infra: [] });
    expect(s).not.toContain('도보권');
  });
});
