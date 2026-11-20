import { describe, it, expect } from 'vitest';
import {
  areaBand,
  percentileOf,
  positionLabel,
  bandChangePct,
  areaRegionRow,
  signedPct,
  volumeCompare,
  QUANTILE_STEPS,
  type AptRegionSnapshot,
} from '@/lib/apt-region/compare';

// 0..100을 5 간격으로 두면 percentileOf(v)=v가 된다(검산이 쉬운 분포).
const linear = QUANTILE_STEPS.map((s) => s * 100);

describe('areaBand', () => {
  it('60·85·102·135㎡ 경계', () => {
    expect(areaBand(59.99)).toBe(1);
    expect(areaBand(60)).toBe(2);
    expect(areaBand(84.99)).toBe(2);
    expect(areaBand(85)).toBe(3);
    expect(areaBand(134.87)).toBe(4);
    expect(areaBand(135)).toBe(5);
  });
});

describe('percentileOf', () => {
  it('분위점 사이를 선형 보간', () => {
    expect(percentileOf(22, linear)).toBeCloseTo(22);
    expect(percentileOf(50, linear)).toBeCloseTo(50);
  });
  it('범위 밖은 0/100', () => {
    expect(percentileOf(-1, linear)).toBe(0);
    expect(percentileOf(101, linear)).toBe(100);
  });
  it('같은 값이 이어지는 분위점에서도 NaN이 나지 않는다', () => {
    const flat = QUANTILE_STEPS.map(() => 400);
    // 모두 같은 값이면 그 값보다 싼 거래는 없다(0), 그보다 비싸면 전부 싸다(100).
    expect(percentileOf(400, flat)).toBe(0);
    expect(percentileOf(401, flat)).toBe(100);
    expect(Number.isNaN(percentileOf(400, flat))).toBe(false);
  });
});

describe('positionLabel', () => {
  it('50 미만은 하위, 이상은 상위, 0%는 쓰지 않는다', () => {
    expect(positionLabel(21.7)).toBe('하위 22%');
    expect(positionLabel(85)).toBe('상위 15%');
    expect(positionLabel(0.2)).toBe('하위 1%');
    expect(positionLabel(100)).toBe('상위 1%');
  });
});

describe('signedPct', () => {
  it('부호와 소수 1자리', () => {
    expect(signedPct(3.21)).toBe('+3.2%');
    expect(signedPct(-4.66)).toBe('−4.7%');
    expect(signedPct(0.01)).toBe('0.0%');
  });
});

const band = (n12: number, nPrev: number, medPrev: number | null) => ({ n12, nPrev, q: n12 >= 30 ? linear : null, medPrev });

describe('bandChangePct', () => {
  it('두 기간 모두 30건 이상일 때만', () => {
    expect(bandChangePct(band(40, 40, 40))).toBeCloseTo(25); // 중간값 50 vs 40
    expect(bandChangePct(band(40, 29, 40))).toBeNull();
    expect(bandChangePct(band(29, 40, 40))).toBeNull();
    expect(bandChangePct(undefined)).toBeNull();
  });
});

describe('areaRegionRow', () => {
  const snap: AptRegionSnapshot = { label: '의정부시', sale12: 100, salePrev: 80, bands: { 2: band(2490, 2076, 40) } };
  it('같은 면적대 칸으로 위치를 계산', () => {
    const r = areaRegionRow({ areaSqm: 75.2, medPpa12m: 22, count12m: 12 }, snap)!;
    expect(r.bandLabel).toBe('60~85㎡');
    expect(r.position).toBe('하위 22%');
    expect(r.regionMedian).toBe(50);
    expect(r.regionCount).toBe(2490);
    expect(r.dist).toEqual([10, 25, 50, 75, 90]);
    expect(r.regionChangePct).toBeCloseTo(25);
  });
  it('단지 표본 3건 미만·지역 칸 없음·스냅샷 없음이면 null', () => {
    expect(areaRegionRow({ areaSqm: 75, medPpa12m: 22, count12m: 2 }, snap)).toBeNull();
    expect(areaRegionRow({ areaSqm: 59, medPpa12m: 22, count12m: 12 }, snap)).toBeNull();
    expect(areaRegionRow({ areaSqm: 75, medPpa12m: 22, count12m: 12 }, null)).toBeNull();
  });
});


describe('volumeCompare', () => {
  const snap: AptRegionSnapshot = { label: '의정부시', sale12: 5459, salePrev: 4416, bands: {} };
  it('단지·지역 거래량 변화를 함께', () => {
    const v = volumeCompare({ n12: 33, nPrev: 26 }, snap)!;
    expect(v.changePct).toBeCloseTo(26.9, 1);
    expect(v.region!.changePct).toBeCloseTo(23.6, 1);
  });
  it('단지 직전 12개월 5건 미만이면 null, 지역 없으면 단지만', () => {
    expect(volumeCompare({ n12: 10, nPrev: 4 }, snap)).toBeNull();
    expect(volumeCompare({ n12: 10, nPrev: 8 }, null)!.region).toBeNull();
  });
});
