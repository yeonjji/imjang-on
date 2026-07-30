import { describe, it, expect } from 'vitest';
import {
  hospitalDescriptor,
  schoolDescriptor,
  pharmacyDescriptor,
} from '@/lib/seo/facility-descriptor';

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

describe('schoolDescriptor', () => {
  it('설립구분을 앞에 붙인다', () => {
    expect(schoolDescriptor('공립', '남녀공학', '중학교')).toBe('공립 중학교');
  });

  it('공학은 표기 형태와 무관하게 생략한다', () => {
    // NEIS 원값이 정규화 없이 저장돼 '남녀공학'/'남여공학' 둘 다 올 수 있다
    expect(schoolDescriptor('사립', '남여공학', '고등학교')).toBe('사립 고등학교');
  });

  it('단성 학교는 남자·여자를 붙인다', () => {
    expect(schoolDescriptor('사립', '여', '고등학교')).toBe('사립 여자 고등학교');
    expect(schoolDescriptor('공립', '남', '중학교')).toBe('공립 남자 중학교');
  });

  it('예상 못한 coeduType은 키워드를 생략한다', () => {
    expect(schoolDescriptor('공립', '기타', '초등학교')).toBe('공립 초등학교');
  });

  it('설립구분이 없으면 학교 종류만 낸다', () => {
    expect(schoolDescriptor(null, null, '초등학교')).toBe('초등학교');
  });

  it('학교 종류도 없으면 학교로 폴백한다', () => {
    expect(schoolDescriptor(null, null, null)).toBe('학교');
  });
});

describe('pharmacyDescriptor', () => {
  it('읍면동을 앞에 붙인다', () => {
    expect(pharmacyDescriptor('역삼동')).toBe('역삼동 약국');
  });

  it('읍면동이 없으면 약국만 낸다', () => {
    expect(pharmacyDescriptor(null)).toBe('약국');
  });
});
