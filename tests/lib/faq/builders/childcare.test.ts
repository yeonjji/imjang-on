import { describe, it, expect } from 'vitest';
import { buildChildcareFaq } from '@/lib/faq/builders/childcare';

const base = {
  name: '샘플어린이집',
  crType: '국공립',
  capacity: 60,
  currentCount: 48,
  waitCntTot: 12,
  staffCount: 10,
  regionFullName: '서울특별시 강남구',
};

describe('buildChildcareFaq', () => {
  it('substitutes 유형/정원/현원 with 보건복지부 source', () => {
    const items = buildChildcareFaq(base);
    expect(items.find((i) => i.q.includes('유형'))!.a).toContain('국공립');
    expect(items.find((i) => i.q.includes('정원'))!.a).toContain('60');
    expect(items.find((i) => i.q.includes('정원'))!.a).toContain('48');
    expect(items.every((i) => i.source === '보건복지부')).toBe(true);
  });

  it('omits waitlist Q&A when waitCntTot is 0/null but keeps >= 2 (정원현원 + 출처)', () => {
    const items = buildChildcareFaq({ ...base, crType: null, waitCntTot: 0, staffCount: null });
    expect(items.some((i) => i.q.includes('대기'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
