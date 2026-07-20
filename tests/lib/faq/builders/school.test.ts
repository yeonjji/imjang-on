import { describe, it, expect } from 'vitest';
import { buildSchoolFaq } from '@/lib/faq/builders/school';

const base = {
  name: '샘플초등학교',
  schoolKind: '초등학교',
  foundType: '공립',
  coeduType: '남여공학',
  regionFullName: '서울특별시 강남구',
  eduOffice: '서울특별시강남서초교육지원청',
  address: '서울특별시 강남구 테헤란로 1',
};

describe('buildSchoolFaq', () => {
  it('describes school kind/foundation with NEIS source', () => {
    const q = buildSchoolFaq(base).find((i) => i.q.includes('어떤 학교'));
    expect(q!.a).toContain('공립');
    expect(q!.a).toContain('초등학교');
    expect(q!.source).toBe('교육부·학교알리미');
  });

  it('keeps >= 2 dynamic items (address + source) even with no kind/found/coedu', () => {
    const items = buildSchoolFaq({ ...base, schoolKind: null, foundType: null, coeduType: null });
    expect(items.some((i) => i.q.includes('어떤 학교'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it('substitutes the address into the location Q&A', () => {
    const q = buildSchoolFaq(base).find((i) => i.q.includes('위치'));
    expect(q!.a).toContain(base.address);
  });
});
