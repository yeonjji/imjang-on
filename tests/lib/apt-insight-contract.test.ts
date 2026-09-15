import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';

const BASE: AptInsightInput = {
  name: '헬리오시티',
  sigunguName: '송파구',
  builtYear: 2018,
  households: 9510,
  saleDeals: [
    { contractDate: '2026-01-10', amountManwon: 250000 },
    { contractDate: '2026-08-20', amountManwon: 290000 },
  ],
  saleTrend: { changePct: 17.4, pyeong: 26, sampleCount: 93 },
  regionAvgSaleManwon: 134000,
  regionSampleCount: 120,
  nearestStation: { name: '송파', lines: ['8호선'], distanceMeters: 480 },
  infra: [
    { label: '편의·마트', count: 1, capped: false },
    { label: '카페', count: 7, capped: false },
    { label: '병원', count: 12, capped: true },
  ],
  floorPremium: { pyeong: 26, pctPerFloor: 1.2, r2: 0.35, n: 77 },
  flags: { cancelledCount12m: 1, anomalyCount12m: 13, topAnomaly: null },
};

describe('색인 계약', () => {
  it('fired는 core와 extra 키만 담는다', () => {
    expect(buildAptNarrative(BASE)?.fired).toEqual(['scale', 'trend', 'peer', 'access', 'floor', 'flags']);
  });

  it('단지정보를 넣어도 fired가 변하지 않는다', () => {
    const withComplex: AptInsightInput = {
      ...BASE,
      unitMix: {
        bands: [
          { label: '60㎡ 이하', units: 2854, pct: 30 },
          { label: '60~85㎡', units: 5132, pct: 54 },
          { label: '85~135㎡', units: 1500, pct: 16 },
          { label: '135㎡ 초과', units: 24, pct: 0 },
        ],
        smallMidPct: 84,
        dominant: { label: '60~85㎡', pct: 54 },
      },
      density: {
        parkingPerHousehold: 1.27, parkingAllUnderground: true,
        evPer100: 2.7, householdsPerElevator: 25, cctvPer100: 28,
      },
    };
    expect(buildAptNarrative(withComplex)!.fired).toEqual(buildAptNarrative(BASE)!.fired);
  });

  it('display가 fired 길이를 바꾸지 않는다 — 색인 판정은 fired만 센다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.fired.length).toBe(6);
    expect(n.display!.length).toBeGreaterThan(0);
  });
});

describe('메타 설명 계약', () => {
  it('text는 sentences를 공백으로 이은 것이다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.text).toBe(n.sentences.join(' '));
  });

  it('앞 150자가 규모·연식 문장으로 시작한다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.text.slice(0, 150)).toMatch(/^헬리오시티는 2018년 준공 · 9,510세대 단지입니다\./);
  });

  it('문장 개수와 순서가 유지된다', () => {
    const n = buildAptNarrative(BASE)!;
    expect(n.sentences).toHaveLength(6);
    expect(n.sentences[0]).toContain('준공');
    expect(n.sentences[n.sentences.length - 1]).toContain('집계됩니다');
  });
});

describe('게이트', () => {
  it('core가 3개 미만이면 narrative 자체가 null이다', () => {
    expect(buildAptNarrative({
      ...BASE, saleDeals: [], saleTrend: null, regionAvgSaleManwon: null,
      nearestStation: null, infra: [], floorPremium: null, flags: null,
    })).toBeNull();
  });
});
