import { describe, it, expect } from 'vitest';
import { buildAptNarrative } from '@/lib/insights/apt';
import type { UnitMix, DensityFacts } from '@/lib/insights/apt-complex';

/** 색인 게이트(발화 3 + trend|peer)를 통과하는 최소 입력. */
const BASE = {
  name: '헬리오시티',
  sigunguName: '송파구',
  builtYear: 2018,
  households: 9510,
  saleDeals: [
    { contractDate: '2025-01-10', amountManwon: 180000 },
    { contractDate: '2026-01-10', amountManwon: 200000 },
  ],
  saleTrend: { changePct: 11, pyeong: 34, sampleCount: 12 },
  regionAvgSaleManwon: 150000,
  regionSampleCount: 40,
  nearestStation: { name: '송파역', lines: ['8호선'], distanceMeters: 300 },
  infra: [
    { label: '병원', count: 12, capped: false },
    { label: '마트', count: 3, capped: false },
    { label: '공원', count: 2, capped: false },
  ],
};

/**
 * 분기 조건만 통제하는 합성 UnitMix. bands의 개별 비중은 문장 분기에 쓰이지 않지만
 * (분기는 smallMidPct와 dominant.pct만 본다) 음수가 나오지 않게 맞춰 둔다.
 */
const mix = (smallMidPct: number, dominantPct: number, label: UnitMix['dominant']['label']): UnitMix => {
  const small = Math.min(smallMidPct, dominantPct);
  return {
    bands: [
      { label: '60㎡ 이하', units: 1, pct: smallMidPct - small },
      { label: '60~85㎡', units: 1, pct: small },
      { label: '85~135㎡', units: 1, pct: 100 - smallMidPct },
      { label: '135㎡ 초과', units: 0, pct: 0 },
    ],
    smallMidPct,
    dominant: { label, pct: dominantPct },
  };
};

const density = (p: Partial<DensityFacts>): DensityFacts => ({
  parkingPerHousehold: null, parkingAllUnderground: false,
  evPer100: null, householdsPerElevator: null, cctvPer100: null, ...p,
});

describe('색인 계약', () => {
  it('단지 모듈은 fired에 들어가지 않는다', () => {
    const n = buildAptNarrative({
      ...BASE,
      unitMix: mix(84, 54, '60~85㎡'),
      density: density({ parkingPerHousehold: 1.27, parkingAllUnderground: true }),
    })!;
    expect(n.fired).not.toContain('unitMix');
    expect(n.fired).not.toContain('parking');
    expect(n.sentences.length).toBeGreaterThan(n.fired.length);
  });

  it('단지 문장을 넣어도 fired 개수가 변하지 않는다', () => {
    const without = buildAptNarrative(BASE)!;
    const withMix = buildAptNarrative({
      ...BASE,
      unitMix: mix(84, 54, '60~85㎡'),
      density: density({ parkingPerHousehold: 1.27 }),
    })!;
    expect(withMix.fired).toEqual(without.fired);
    expect(withMix.sentences.length).toBe(without.sentences.length + 2);
  });

  it('단지 문장은 맨 뒤에 붙는다 — 메타 설명(앞 150자)을 건드리지 않는다', () => {
    const n = buildAptNarrative({ ...BASE, unitMix: mix(84, 54, '60~85㎡') })!;
    expect(n.sentences[n.sentences.length - 1]).toContain('중소형');
  });
});

describe('unitMixInsight — 구간 경계', () => {
  const say = (m: UnitMix | null) => {
    const n = buildAptNarrative({ ...BASE, unitMix: m });
    return n?.sentences.find((s) => s.includes('전용')) ?? null;
  };

  it('dominant 100%면 단일 면적대', () => {
    expect(say(mix(100, 100, '60~85㎡'))).toContain('한 종류');
  });
  it('dominant 99%면 단일이 아니라 실제 비율을 말한다 — 분기 공백이 없다', () => {
    const s = say(mix(99, 99, '60~85㎡'));
    expect(s).not.toContain('한 종류');
    expect(s).toContain('중소형 중심');
  });
  it('85㎡ 이하 80% 이상이면 중소형 중심', () => {
    expect(say(mix(80, 54, '60~85㎡'))).toContain('중소형 중심');
    expect(say(mix(84, 54, '60~85㎡'))).toContain('중소형 중심');
  });
  it('79%면 중소형 중심이 아니다', () => {
    expect(say(mix(79, 54, '60~85㎡'))).not.toContain('중소형 중심');
  });
  it('85㎡ 이하 35% 이하면 중대형', () => {
    expect(say(mix(35, 54, '85~135㎡'))).toContain('중대형');
    expect(say(mix(29, 54, '85~135㎡'))).toContain('중대형');
  });
  it('36%면 중대형이 아니라 혼합이다', () => {
    expect(say(mix(36, 54, '60~85㎡'))).toContain('고르게');
  });
  it('unitMix가 null이면 문장이 없다', () => {
    expect(say(null)).toBeNull();
  });
});

describe('parkingInsight — 구간 경계', () => {
  const say = (d: DensityFacts) => {
    const n = buildAptNarrative({ ...BASE, density: d });
    return n?.sentences.find((s) => s.includes('주차')) ?? null;
  };

  it('1.5 이상이면 넉넉한 편', () => {
    expect(say(density({ parkingPerHousehold: 1.8 }))).toContain('넉넉한 편');
  });
  it('1.27이면 수치만 말한다', () => {
    const s = say(density({ parkingPerHousehold: 1.27 }))!;
    expect(s).toContain('1.27대');
    expect(s).not.toContain('넉넉');
    expect(s).not.toContain('못 미칩니다');
  });
  it('1.0 미만이면 못 미친다고 말한다', () => {
    expect(say(density({ parkingPerHousehold: 0.8 }))).toContain('못 미칩니다');
  });
  it('전면 지하면 구조를 덧붙인다', () => {
    expect(say(density({ parkingPerHousehold: 1.27, parkingAllUnderground: true }))).toContain('전부 지하');
  });
  it('총평·단서 문구를 쓰지 않는다', () => {
    const s = say(density({ parkingPerHousehold: 1.27 }))!;
    expect(s).not.toContain('양호');
    expect(s).not.toContain('다를 수 있');
  });
  it('세대당 주차가 null이면 문장이 없다', () => {
    expect(say(density({}))).toBeNull();
  });
});
