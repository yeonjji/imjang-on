import { describe, it, expect } from 'vitest';
import { buildHospitalNarrative, type HospitalInsightInput } from '@/lib/insights/hospital';

const base: HospitalInsightInput = {
  name: '서울정형외과의원',
  typeName: '의원',
  deptCount: 5,
  deptWithSpecialistCount: 3,
  topDeptNames: ['정형외과', '내과', '재활의학과'],
  totalDoctors: 12,
  specialistTotal: 10,
  bedCounts: [{ label: '일반병상', count: 30 }, { label: '수술실', count: 2 }],
  nearestStation: { name: '강남역', lines: ['2호선'], distanceMeters: 320 },
  infra: [{ label: '카페', count: 9 }, { label: '약국', count: 4 }],
  nearbyAptSaleManwon: [130000, 180000, 240000],
};

describe('buildHospitalNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 스타 모듈 발화', () => {
    const n = buildHospitalNarrative(base)!;
    expect(n.sentences[0].startsWith('서울정형외과의원은')).toBe(true);
    expect(n.fired).toContain('depts');
    expect(n.fired).toContain('doctors');
    expect(n.fired).toContain('access');
    expect(n.fired).toContain('price');
  });
  it('소개: 유형 + 진료과 수', () => {
    expect(buildHospitalNarrative(base)!.text).toContain('의원으로 진료과 5개과를 운영합니다');
  });
  it('진료과: 전문의 배치 과 수 + 주요 과목', () => {
    const t = buildHospitalNarrative(base)!.text;
    expect(t).toContain('전문의가 배치된 과는 3개');
    expect(t).toContain('정형외과·내과·재활의학과');
  });
  it('의사수 구간: 10/12≈83% → 전문의 중심', () => {
    expect(buildHospitalNarrative(base)!.text).toContain('전문의가 10명(약 83%)으로 전문의 중심으로 운영됩니다');
  });
  it('의사수 구간: <50% → 일반의·전공의 함께', () => {
    const n = buildHospitalNarrative({ ...base, totalDoctors: 12, specialistTotal: 4 })!; // 33%
    expect(n.text).toContain('일반의·전공의도 함께 근무합니다');
  });
  it('병상: 조합으로 규모 판단', () => {
    const t = buildHospitalNarrative(base)!.text;
    expect(t).toContain('일반병상 30·수술실 2');
    expect(t).toContain('수술이 가능한 시설을 갖췄습니다'); // 응급실·중환자실 없고 수술실 있음
  });
  it('specialistTotal null이면 단순 의사수 문장', () => {
    const n = buildHospitalNarrative({ ...base, specialistTotal: null, deptWithSpecialistCount: 0 })!;
    expect(n.text).toContain('의사 12명이 근무합니다');
    expect(n.text).not.toContain('전문의가');
  });
  it('depts는 specialistTotal이 null이어도 deptWithSpecialistCount로 발화한다', () => {
    const n = buildHospitalNarrative({
      ...base,
      specialistTotal: null,
      deptWithSpecialistCount: 3,
      topDeptNames: [],
    })!;
    expect(n.fired).toContain('depts');
    expect(n.text).toContain('전문의가 배치된 과는 3개');
  });
  it('가드: 스타(진료과·의사수) 미발화 & 3모듈 미만이면 null', () => {
    const n = buildHospitalNarrative({
      ...base, typeName: '', deptCount: 0, deptWithSpecialistCount: 0, topDeptNames: [],
      totalDoctors: null, specialistTotal: null, bedCounts: [],
      nearestStation: null, infra: [{ label: '카페', count: 9 }], nearbyAptSaleManwon: [],
    });
    expect(n).toBeNull();
  });
  it('고유성: 전문의 비율이 다르면 결론 문장이 달라진다', () => {
    const a = buildHospitalNarrative(base)!;
    const b = buildHospitalNarrative({ ...base, specialistTotal: 4 })!;
    expect(a.text).not.toEqual(b.text);
  });
});
