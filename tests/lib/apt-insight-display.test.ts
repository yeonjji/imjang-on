import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';
import type { DisplayUnit } from '@/lib/insights/shared';

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
};

const units = (d: AptInsightInput): DisplayUnit[] => buildAptNarrative(d)?.display ?? [];
const byKey = (d: AptInsightInput, key: string) => units(d).find((u) => u.key === key);

describe('가격 수준 타일', () => {
  it('최근 실거래가와 시군구 평균을 각각 제 자리에 넣는다', () => {
    expect(byKey(BASE, 'peer')).toEqual({
      shape: 'tile', key: 'peer', label: '가격 수준', value: '29억', sub: '송파구 평균 13.4억',
    });
  });
});

describe('가격 흐름 타일', () => {
  it('상승은 + 부호와 tone up', () => {
    expect(byKey(BASE, 'trend')).toEqual({
      shape: 'tile', key: 'trend', label: '가격 흐름', value: '+17.4%',
      sub: '26평 · 직전 12개월 대비 · 표본 93건', tone: 'up',
    });
  });

  it('하락은 − 부호와 tone down', () => {
    const d = { ...BASE, saleTrend: { changePct: -3.2, pyeong: 26, sampleCount: 20 } };
    expect(byKey(d, 'trend')).toMatchObject({ value: '−3.2%', tone: 'down' });
  });

  it('보합은 부호 없이 표기하고 tone이 없다', () => {
    const d = { ...BASE, saleTrend: { changePct: 1, pyeong: 26, sampleCount: 20 } };
    const u = byKey(d, 'trend');
    expect(u).toMatchObject({ value: '보합' });
    expect(u && 'tone' in u ? u.tone : undefined).toBeUndefined();
  });

  // 같은 평형 표본이 부족해 방향을 못 세우면 문장은 최근가만 말한다.
  // 그 값은 이미 '가격 수준' 타일에 있으므로 타일을 또 만들지 않는다.
  it('saleTrend가 없으면 타일을 내지 않는다', () => {
    expect(byKey({ ...BASE, saleTrend: null }, 'trend')).toBeUndefined();
  });

  // 회귀 방지: saleTrend는 최근 실거래와 같은 평형으로 좁힌 값이다(단지 전체 추세가 아니다).
  // sub가 평형으로 시작하지 않으면 이 한정이 다시 탈락한 것이다.
  it('sub가 평형으로 시작해 단지 전체 추세로 오인되지 않게 한다', () => {
    const u = byKey(BASE, 'trend');
    expect(u && 'sub' in u ? u.sub : undefined).toMatch(/^26평 · /);
  });
});

describe('입지 타일과 생활 편의 칩', () => {
  it('역은 타일로, 인프라는 칩으로 나뉜다', () => {
    expect(byKey(BASE, 'access')).toEqual({
      shape: 'tile', key: 'access', label: '입지', value: '도보 6분', sub: '8호선 송파',
    });
    expect(byKey(BASE, 'infra')).toEqual({
      shape: 'chips', key: 'infra', label: '생활 편의',
      chips: [
        { label: '편의·마트', value: '1' },
        { label: '카페', value: '7' },
        { label: '병원', value: '12+' },
      ],
    });
  });

  it('역이 없으면 타일만 빠지고 칩은 남는다', () => {
    const d = { ...BASE, nearestStation: null };
    expect(byKey(d, 'access')).toBeUndefined();
    expect(byKey(d, 'infra')).toBeDefined();
  });

  it('인프라가 2종 미만이면 칩이 없다', () => {
    const d = { ...BASE, infra: [{ label: '카페', count: 3, capped: false }] };
    expect(byKey(d, 'infra')).toBeUndefined();
    expect(byKey(d, 'access')).toBeDefined();
  });
});

describe('층별 시세 카드', () => {
  it('양의 기울기는 + 부호', () => {
    const d = { ...BASE, floorPremium: { pyeong: 26, pctPerFloor: 1.2, r2: 0.35, n: 77 } };
    expect(byKey(d, 'floor')).toEqual({
      shape: 'card', key: 'floor', label: '층별 시세', value: '한 층당 +1.2%',
      sub: '26평 · 최근 매매 77건 · 설명력 R² 0.35',
    });
  });

  it('음의 기울기는 − 부호', () => {
    const d = { ...BASE, floorPremium: { pyeong: 26, pctPerFloor: -0.8, r2: 0.2, n: 30 } };
    expect(byKey(d, 'floor')).toMatchObject({ value: '한 층당 −0.8%' });
  });
});

describe('거래 특이사항 주의 박스', () => {
  it('두 항목이 다 있으면 이어 붙인다', () => {
    const d = { ...BASE, flags: { cancelledCount12m: 1, anomalyCount12m: 13, topAnomaly: null } };
    expect(byKey(d, 'flags')).toEqual({
      shape: 'alert', key: 'flags', label: '거래 특이사항',
      value: '해제 신고 1건 · ±10% 이탈 13건', sub: '최근 1년',
    });
  });

  it('이상거래만 있으면 그것만 적는다', () => {
    const d = { ...BASE, flags: { cancelledCount12m: 0, anomalyCount12m: 4, topAnomaly: null } };
    expect(byKey(d, 'flags')).toMatchObject({ value: '±10% 이탈 4건' });
  });
});

describe('표시 단위를 내지 않는 모듈', () => {
  it('규모·연식은 헤더 문장이 담당하므로 display가 없다', () => {
    expect(byKey(BASE, 'scale')).toBeUndefined();
  });

  it('면적 구성과 주차는 아래 섹션이 담당하므로 display가 없다', () => {
    const d: AptInsightInput = {
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
    expect(byKey(d, 'unitMix')).toBeUndefined();
    expect(byKey(d, 'parking')).toBeUndefined();
  });
});

describe('배지', () => {
  it('도보 15분 이내면 역세권', () => {
    expect(buildAptNarrative(BASE)?.badges).toContain('역세권');
  });

  it('도보 16분이면 역세권이 아니다', () => {
    const d = { ...BASE, nearestStation: { name: '송파', lines: ['8호선'], distanceMeters: 1300 } };
    expect(buildAptNarrative(d)?.badges ?? []).not.toContain('역세권');
  });

  it('1,000세대 이상이면 대단지', () => {
    expect(buildAptNarrative(BASE)?.badges).toContain('대단지');
    expect(buildAptNarrative({ ...BASE, households: 999 })?.badges ?? []).not.toContain('대단지');
  });

  it('세대수를 모르면 대단지 배지가 없다', () => {
    expect(buildAptNarrative({ ...BASE, households: null })?.badges ?? []).not.toContain('대단지');
  });
});
