import { describe, it, expect } from 'vitest';
import {
  hospitalDescriptor,
  schoolDescriptor,
  pharmacyDescriptor,
  amenityDescriptor,
  urbanParkDescriptor,
  urbanParkingDescriptor,
  urbanChargerDescriptor,
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

  it('공학 접미사 없는 남녀/남여 표기는 남자로 오표기하지 않고 키워드를 생략한다', () => {
    expect(schoolDescriptor('공립', '남녀', '중학교')).toBe('공립 중학교');
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

describe('amenityDescriptor', () => {
  it('전통시장은 상설·정기를 앞에 붙인다', () => {
    expect(amenityDescriptor('market', { marketType: '상설시장' }, '전통시장')).toBe('상설 전통시장');
    expect(amenityDescriptor('market', { marketType: '정기시장' }, '전통시장')).toBe('정기 전통시장');
  });

  it('전통시장 유형이 미분류면 라벨만 낸다', () => {
    expect(amenityDescriptor('market', { marketType: null }, '전통시장')).toBe('전통시장');
  });

  it('마트는 업종명이 라벨을 대체한다', () => {
    expect(amenityDescriptor('mart', { industryName: '슈퍼마켓' }, '마트')).toBe('슈퍼마켓');
  });

  it('마트 업종명이 없으면 라벨만 낸다', () => {
    expect(amenityDescriptor('mart', { industryName: null }, '마트')).toBe('마트');
  });

  it('편의점·카페는 업종명을 쓰지 않는다 — 라벨과 동어반복이다', () => {
    expect(amenityDescriptor('convenience', { industryName: '체인화 편의점' }, '편의점')).toBe('편의점');
    expect(amenityDescriptor('cafe', { industryName: '커피전문점/카페/다방' }, '카페')).toBe('카페');
  });
});

describe('urbanParkDescriptor', () => {
  it('공원 유형이 시설명을 흡수한다', () => {
    expect(urbanParkDescriptor('근린공원')).toBe('근린공원');
    expect(urbanParkDescriptor('어린이공원')).toBe('어린이공원');
  });

  it('유형이 없으면 공원으로 폴백한다', () => {
    expect(urbanParkDescriptor(null)).toBe('공원');
  });
});

describe('urbanParkingDescriptor', () => {
  it('요금과 운영주체를 함께 붙인다', () => {
    expect(urbanParkingDescriptor('무료', '공영')).toBe('무료 공영주차장');
  });

  it('요금만 있으면 요금만 붙인다', () => {
    expect(urbanParkingDescriptor('유료', null)).toBe('유료 주차장');
  });

  it('운영주체만 있으면 운영주체만 붙인다', () => {
    expect(urbanParkingDescriptor(null, '민영')).toBe('민영주차장');
  });

  it('둘 다 없으면 주차장으로 폴백한다', () => {
    expect(urbanParkingDescriptor(null, null)).toBe('주차장');
  });
});

describe('urbanChargerDescriptor', () => {
  it('충전 속도를 앞에 붙인다', () => {
    expect(urbanChargerDescriptor('급속')).toBe('급속 전기차충전소');
    expect(urbanChargerDescriptor('완속')).toBe('완속 전기차충전소');
  });

  it('속도가 없으면 전기차충전소만 낸다', () => {
    expect(urbanChargerDescriptor(null)).toBe('전기차충전소');
  });
});
