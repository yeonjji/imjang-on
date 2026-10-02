import { describe, it, expect } from 'vitest';
import { per30, median } from '@/lib/urban/parking-context';
import { pharmacyYears } from '@/lib/pharmacy/context';
import { primaryDept } from '@/lib/hospital/context';

describe('per30', () => {
  it('기본시간·요금을 30분 요금으로', () => {
    expect(per30(30, 1000)).toBe(1000);
    expect(per30(60, 1000)).toBe(500);
    expect(per30(10, 300)).toBe(900);
  });
  it('1440분(=1일 요금)이나 범위 밖 기본시간은 환산하지 않는다', () => {
    expect(per30(1440, 10000)).toBeNull();
    expect(per30(3, 100)).toBeNull();
    expect(per30(30, 0)).toBeNull();
    expect(per30(null, 1000)).toBeNull();
  });
});

describe('median', () => {
  it('중앙값', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 = 2.5 → 반올림 3
    expect(median([])).toBeNull();
  });
});

describe('pharmacyYears', () => {
  it('개설 연도 포함 연차', () => {
    expect(pharmacyYears(new Date('2007-10-10T00:00:00Z'), 2026)).toBe(20);
    expect(pharmacyYears(new Date('2026-03-01T00:00:00Z'), 2026)).toBe(1);
  });
  it('없거나 미래면 null', () => {
    expect(pharmacyYears(null, 2026)).toBeNull();
    expect(pharmacyYears(new Date('2027-01-01T00:00:00Z'), 2026)).toBeNull();
  });
});

describe('primaryDept', () => {
  it('이름에 들어 있는 진료과를 대표 과로', () => {
    expect(primaryDept('밝은내과의원', ['내과', '가정의학과', '피부과'])).toBe('내과');
  });
  it('겹치는 이름은 가장 긴 일치(소아청소년과 > 청소년과)', () => {
    expect(primaryDept('우리소아청소년과의원', ['청소년과', '소아청소년과'])).toBe('소아청소년과');
  });
  it('공백 차이는 무시', () => {
    expect(primaryDept('서울 정형외과의원', ['정형 외과'])).toBe('정형 외과');
  });
  it('이름에 없으면 null', () => {
    expect(primaryDept('하나의원', ['내과', '피부과'])).toBeNull();
  });
});
