import { describe, it, expect } from 'vitest';
import { isNewbuildEligible, exclusiveAreaOf, newbuildView, type NewbuildSnapshot } from '@/lib/subscription/newbuild-compare';

describe('isNewbuildEligible', () => {
  const apt = { category: 'APT', name: '의정부역 펠리스타워 양우내안애', rawJson: { RENT_SECD_NM: '분양주택' } };
  it('APT 분양주택만', () => {
    expect(isNewbuildEligible(apt)).toBe(true);
    expect(isNewbuildEligible({ ...apt, rawJson: { RENT_SECD_NM: '분양전환 가능임대' } })).toBe(false);
    expect(isNewbuildEligible({ ...apt, category: 'REMNANT' })).toBe(false);
  });
  it('신혼희망타운·토지임대부는 제외(분양가 구조가 달라 배율 왜곡)', () => {
    expect(isNewbuildEligible({ ...apt, name: '시흥 거모 신혼희망타운(공공분양)' })).toBe(false);
    expect(isNewbuildEligible({ ...apt, name: '고덕강일지구 3단지 토지임대부(본청약)' })).toBe(false);
  });
});

describe('exclusiveAreaOf', () => {
  it('주택형 앞 숫자가 전용면적', () => {
    expect(exclusiveAreaOf('084.7415A')).toBeCloseTo(84.7415);
    expect(exclusiveAreaOf('059.9777')).toBeCloseTo(59.9777);
    expect(exclusiveAreaOf('23A')).toBe(23);
    expect(exclusiveAreaOf('A형')).toBeNull();
    expect(exclusiveAreaOf(null)).toBeNull();
  });
});

describe('newbuildView', () => {
  // 의정부역 펠리스타워 양우내안애(15743) 실측: 59 띠 775.3(520건), 84 띠 664.8(312건)
  const snap: NewbuildSnapshot = {
    n: 839, complexes: 47,
    bands: { 1: { n: 520, med: 775.3 }, 2: { n: 312, med: 664.8 }, 3: { n: 7, med: 600 } },
    top: [{ name: '의정부역센트럴자이앤위브캐슬', builtYear: 2022, distanceM: 1269, n: 212, med: 1025 }],
  };
  const units = [
    { houseType: '059.9777', topAmount: 63720 },
    { houseType: '084.7415A', topAmount: 85692 },
    { houseType: '094.0000', topAmount: 90000 }, // 85~102 띠 주변 7건 → 제외
  ];
  it('주택형별 배율, 같은 면적대 10건 미만 주택형은 뺀다', () => {
    const v = newbuildView(units, snap)!;
    expect(v.rows.map((r) => r.houseType)).toEqual(['059.9777', '084.7415A']);
    expect(v.rows[0].ratio).toBeCloseTo(1.37, 2);
    expect(v.rows[1].ratio).toBeCloseTo(1.52, 2);
    expect(v.minRatio).toBeCloseTo(1.37, 2);
    expect(v.maxRatio).toBeCloseTo(1.52, 2);
  });
  it('주변 거래 10건 미만·스냅샷 없음이면 null', () => {
    expect(newbuildView(units, { ...snap, n: 1 })).toBeNull();
    expect(newbuildView(units, null)).toBeNull();
  });
});
