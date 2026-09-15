import { describe, it, expect } from 'vitest';
import {
  buildUnitMix,
  buildDensity,
  buildingAgeYears,
  resolveBuiltYear,
  shouldRenderComplexInfo,
  type ComplexFacts,
} from '@/lib/insights/apt-complex';

/** 헬리오시티 실측값(A10025850). 면적 합 2854+5132+1500+24 = 9510 = 세대수. */
const HELIO: ComplexFacts = {
  households: 9510, buildingCount: 84,
  usedate: new Date('2018-12-28T00:00:00Z'),
  hallType: '혼합식', topFloor: 35, baseFloor: 3,
  area60: 2854, area85: 5132, area135: 1500, area136: 24,
  parkingGround: 0, parkingUnder: 12096,
  evGround: 0, evUnder: 256,
  elevator: 384, cctv: 2685,
  builder: '현대건설,삼성물산,현대산업개발',
  fetchedAt: new Date('2026-09-08T00:00:00Z'),
};
const EMPTY: ComplexFacts = {
  households: null, buildingCount: null, usedate: null, hallType: null,
  topFloor: null, baseFloor: null, area60: null, area85: null,
  area135: null, area136: null, parkingGround: null, parkingUnder: null,
  evGround: null, evUnder: null, elevator: null, cctv: null,
  builder: null, fetchedAt: null,
};

describe('buildUnitMix', () => {
  it('4칸 완비 + 합 일치면 비중을 만든다', () => {
    const m = buildUnitMix(HELIO)!;
    expect(m.bands).toHaveLength(4);
    expect(m.bands.map((b) => b.label)).toEqual(['60㎡ 이하', '60~85㎡', '85~135㎡', '135㎡ 초과']);
    expect(m.bands.map((b) => b.units)).toEqual([2854, 5132, 1500, 24]);
    expect(m.bands.map((b) => b.pct)).toEqual([30, 54, 16, 0]);
  });

  it('85㎡ 이하 비중을 낸다', () => {
    expect(buildUnitMix(HELIO)!.smallMidPct).toBe(84); // 30 + 54
  });

  it('최대 밴드를 dominant로 잡는다', () => {
    expect(buildUnitMix(HELIO)!.dominant).toEqual({ label: '60~85㎡', pct: 54 });
  });

  it('동률이면 작은 면적을 우선한다', () => {
    const m = buildUnitMix({ ...HELIO, households: 200, area60: 100, area85: 100, area135: 0, area136: 0 })!;
    expect(m.dominant.label).toBe('60㎡ 이하');
  });

  it('units 0인 밴드도 배열에 남긴다', () => {
    const m = buildUnitMix({ ...HELIO, households: 100, area60: 100, area85: 0, area135: 0, area136: 0 })!;
    expect(m.bands).toHaveLength(4);
    expect(m.bands[3]).toEqual({ label: '135㎡ 초과', units: 0, pct: 0 });
  });

  it('한 칸이라도 null이면 null', () => {
    expect(buildUnitMix({ ...HELIO, area135: null })).toBeNull();
  });

  it('세대수가 null이면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: null })).toBeNull();
  });

  // 실측 불일치는 0건이지만 원본이 바뀔 때를 위한 가드다.
  it('합이 세대수와 다르면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: 9511 })).toBeNull();
  });

  it('세대수가 0이면 null', () => {
    expect(buildUnitMix({ ...HELIO, households: 0, area60: 0, area85: 0, area135: 0, area136: 0 })).toBeNull();
  });

  it('합이 항상 100 — 단순 반올림이 실패하는 케이스 [1,1,1,0]', () => {
    const m = buildUnitMix({ ...HELIO, households: 3, area60: 1, area85: 1, area135: 1, area136: 0 })!;
    const sum = m.bands.reduce((a, b) => a + b.pct, 0);
    expect(sum).toBe(100);
  });

  it('여러 조합에서 비중 합이 항상 100', () => {
    const testCases = [
      { households: 7, areas: [1, 2, 3, 1] },
      { households: 10, areas: [1, 1, 1, 7] },
      { households: 100, areas: [10, 30, 40, 20] },
      { households: 13, areas: [1, 3, 5, 4] },
      { households: 97, areas: [20, 31, 28, 18] },
      { households: 5, areas: [1, 1, 1, 2] },
    ];
    for (const tc of testCases) {
      const m = buildUnitMix({
        ...HELIO,
        households: tc.households,
        area60: tc.areas[0],
        area85: tc.areas[1],
        area135: tc.areas[2],
        area136: tc.areas[3],
      })!;
      const sum = m.bands.reduce((a, b) => a + b.pct, 0);
      expect(sum).toBe(100);
    }
  });

  it('같은 입력은 같은 결과 — 결정성', () => {
    const input = { ...HELIO, households: 3, area60: 1, area85: 1, area135: 1, area136: 0 };
    const m1 = buildUnitMix(input)!;
    const m2 = buildUnitMix(input)!;
    expect(m1.bands.map((b) => b.pct)).toEqual(m2.bands.map((b) => b.pct));
  });
});

describe('buildDensity', () => {
  it('세대당 주차는 지상+지하를 세대수로 나눈다', () => {
    expect(buildDensity(HELIO).parkingPerHousehold).toBeCloseTo(1.27, 2);
  });

  it('지상 0 · 지하 있음이면 전면 지하주차', () => {
    expect(buildDensity(HELIO).parkingAllUnderground).toBe(true);
  });

  it('지상·지하 둘 다 0이면 전면 지하가 아니다 — 빈 레코드다', () => {
    expect(buildDensity({ ...HELIO, parkingGround: 0, parkingUnder: 0 }).parkingAllUnderground).toBe(false);
  });

  it('지상·지하 중 하나라도 null이면 세대당 주차는 null', () => {
    expect(buildDensity({ ...HELIO, parkingGround: null }).parkingPerHousehold).toBeNull();
  });

  it('승강기는 역수로 낸다 — 9510/384 = 24.8 → 25세대당 1대', () => {
    expect(buildDensity(HELIO).householdsPerElevator).toBe(25);
  });

  it('EV·CCTV는 100세대당으로 낸다', () => {
    expect(buildDensity(HELIO).evPer100).toBeCloseTo(2.7, 1);   // 256/9510*100
    expect(buildDensity(HELIO).cctvPer100).toBeCloseTo(28.2, 1); // 2685/9510*100
  });

  it('세대수가 없으면 밀도는 전부 null', () => {
    const d = buildDensity({ ...HELIO, households: null });
    expect(d.parkingPerHousehold).toBeNull();
    expect(d.evPer100).toBeNull();
    expect(d.householdsPerElevator).toBeNull();
    expect(d.cctvPer100).toBeNull();
  });

  it('세대수가 없어도 전면 지하 판정은 살아 있다 — 구조는 세대수와 무관하다', () => {
    expect(buildDensity({ ...HELIO, households: null }).parkingAllUnderground).toBe(true);
  });

  it('승강기가 0이면 null — 0으로 나눌 수 없다', () => {
    expect(buildDensity({ ...HELIO, elevator: 0 }).householdsPerElevator).toBeNull();
  });
});

describe('buildingAgeYears', () => {
  it('경과 연수를 내림한다', () => {
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-09-09T00:00:00Z'))).toBe(7);
  });
  it('생일 전날이면 아직 이전 해다', () => {
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-12-27T00:00:00Z'))).toBe(7);
    expect(buildingAgeYears(new Date('2018-12-28T00:00:00Z'), new Date('2026-12-28T00:00:00Z'))).toBe(8);
  });
  it('usedate가 없으면 null', () => {
    expect(buildingAgeYears(null, new Date('2026-09-09T00:00:00Z'))).toBeNull();
  });
  it('미래 준공이면 0', () => {
    expect(buildingAgeYears(new Date('2027-01-01T00:00:00Z'), new Date('2026-09-09T00:00:00Z'))).toBe(0);
  });
});

describe('shouldRenderComplexInfo', () => {
  const now = new Date('2026-09-09T00:00:00Z');
  it('타일이 3개 이상이면 렌더한다', () => {
    expect(shouldRenderComplexInfo(HELIO, now)).toBe(true);
  });
  it('타일이 2개면 숨긴다 — 한두 칸짜리 카드는 빈칸으로 읽힌다', () => {
    const two: ComplexFacts = { ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z') };
    expect(shouldRenderComplexInfo(two, now)).toBe(false);
  });
  it('타일이 3개면 렌더한다', () => {
    const three: ComplexFacts = {
      ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z'), elevator: 20,
    };
    expect(shouldRenderComplexInfo(three, now)).toBe(true);
  });
  it('빈 레코드면 숨긴다', () => {
    expect(shouldRenderComplexInfo(EMPTY, now)).toBe(false);
  });

  // 구성 막대가 이 섹션으로 옮겨 온 뒤로는(2026-09-15) 섹션이 숨으면 구성까지 사라진다.
  // 실측 23건(0.2%)이 여기 걸렸다.
  it('타일이 모자라도 면적 구성이 있으면 띄운다', () => {
    const thin: ComplexFacts = {
      ...EMPTY,
      households: 9510,
      area60: 2854, area85: 5132, area135: 1500, area136: 24,
    };
    expect(buildUnitMix(thin)).not.toBeNull();
    expect(shouldRenderComplexInfo(thin, now)).toBe(true);
  });

  it('타일도 구성도 없으면 여전히 숨긴다', () => {
    expect(shouldRenderComplexInfo({ ...EMPTY, households: 500 }, now)).toBe(false);
  });
});

/**
 * 준공 연도 단일화. 실거래 신고의 건축년도와 사용승인일이 어긋나는 단지가
 * 2026-09-14 실측으로 12,518건 중 92건(0.7%) 있었다.
 */
describe('resolveBuiltYear', () => {
  it('사용승인일이 있으면 그 연도를 쓴다', () => {
    expect(resolveBuiltYear(2018, new Date('2015-11-30T00:00:00Z'))).toBe(2015);
  });

  it('사용승인일이 없으면 건축년도를 쓴다', () => {
    expect(resolveBuiltYear(2018, null)).toBe(2018);
  });

  it('둘 다 없으면 null', () => {
    expect(resolveBuiltYear(null, null)).toBeNull();
  });

  it('건축년도가 없어도 사용승인일이 있으면 연도가 나온다', () => {
    expect(resolveBuiltYear(null, new Date('2015-11-30T00:00:00Z'))).toBe(2015);
  });

  // 연말 준공이 UTC 변환으로 한 해 밀리지 않는지. usedate는 @db.Date라 UTC 자정으로 들어온다.
  it('12월 31일 사용승인일이 그 해로 남는다', () => {
    expect(resolveBuiltYear(2019, new Date('2018-12-31T00:00:00Z'))).toBe(2018);
  });
});
