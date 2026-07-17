import { describe, it, expect } from 'vitest';
import { buildHospitalFaq } from '@/lib/faq/builders/hospital';

const base = {
  name: '샘플의원',
  typeName: '의원',
  sigungu: '강남구',
  sido: '서울특별시',
  depts: [{ deptName: '내과' }, { deptName: '가정의학과' }],
  totalDoctors: 5,
  detail: { openMon: 900, closeMon: 1800, erDayOpen: 'N', erNightOpen: 'N' },
};

describe('buildHospitalFaq', () => {
  it('lists 진료과 with hospital name and HIRA source', () => {
    const q = buildHospitalFaq(base).find((i) => i.q.includes('진료과'));
    expect(q!.a).toContain('내과');
    expect(q!.source).toBe('건강보험심사평가원');
  });

  it('renders 진료시간 via formatHospitalTime (HHMM ints → HH:MM)', () => {
    const q = buildHospitalFaq(base).find((i) => i.q.includes('진료시간'));
    expect(q!.a).toContain('09:00');
    expect(q!.a).toContain('18:00');
  });

  it('omits 진료시간 when detail is null but keeps >= 2 dynamic (depts + doctors)', () => {
    const items = buildHospitalFaq({ ...base, detail: null });
    expect(items.some((i) => i.q.includes('진료시간'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('reports 응급실 as 주간·야간 모두 운영 when both flags are Y', () => {
    const items = buildHospitalFaq({ ...base, detail: { ...base.detail, erDayOpen: 'Y', erNightOpen: 'Y' } });
    expect(items.find((i) => i.q.includes('응급실'))!.a).toContain('주간·야간 모두 운영');
  });
});
