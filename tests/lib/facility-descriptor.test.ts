import { describe, it, expect } from 'vitest';
import { hospitalDescriptor } from '@/lib/seo/facility-descriptor';

const dept = (deptName: string, specialistCount: number | null = null) => ({
  deptName,
  specialistCount,
});

describe('hospitalDescriptor', () => {
  it('전문의 수 상위 2개 진료과를 앞에 붙인다', () => {
    expect(hospitalDescriptor([dept('내과', 3), dept('정형외과', 8), dept('피부과', 1)], '병원'))
      .toBe('정형외과·내과 병원');
  });

  it('진료과가 1개면 그 과만 쓴다', () => {
    expect(hospitalDescriptor([dept('안과', 2)], '의원')).toBe('안과 의원');
  });

  it('진료과가 없으면 시설 종류만 낸다', () => {
    expect(hospitalDescriptor([], '치과의원')).toBe('치과의원');
  });

  it('전문의 배치가 없으면 전체 진료과에서 앞의 2개를 쓴다', () => {
    expect(hospitalDescriptor([dept('내과'), dept('소아과'), dept('이비인후과')], '의원'))
      .toBe('내과·소아과 의원');
  });

  it('두 과목 결합이 10자를 넘으면 1개만 쓴다', () => {
    // '소아청소년과·영상의학과' = 12자
    expect(hospitalDescriptor([dept('소아청소년과', 5), dept('영상의학과', 4)], '종합병원'))
      .toBe('소아청소년과 종합병원');
  });
});
