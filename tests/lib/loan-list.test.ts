import { describe, it, expect } from 'vitest';
import { collectFacets, filterLoans, type LoanSummary } from '@/lib/loan/list';

const rows: LoanSummary[] = [
  { seq: 1, finprdnm: '청년전세대출', ofrinstnm: 'A', instCtg: '시중은행', lnlmt: 2000, irt: '3', usageTags: ['주거'], targetTags: ['청년'], regionTags: ['전국'] },
  { seq: 2, finprdnm: '소상공인 운영자금', ofrinstnm: 'B', instCtg: '지자체', lnlmt: 5000, irt: '2', usageTags: ['운영'], targetTags: ['소상공인'], regionTags: ['서울'] },
  { seq: 3, finprdnm: '주거안정 자금', ofrinstnm: 'C', instCtg: '시중은행', lnlmt: 3000, irt: '1', usageTags: ['주거', '생계'], targetTags: ['청년', '근로자'], regionTags: ['전국', '서울'] },
];

describe('collectFacets', () => {
  it('태그별 고유값+카운트를 모은다', () => {
    const f = collectFacets(rows);
    expect(f.usage).toContainEqual({ value: '주거', count: 2 });
    expect(f.inst).toContainEqual({ value: '시중은행', count: 2 });
    expect(f.region).toContainEqual({ value: '전국', count: 2 });
  });
});

describe('filterLoans', () => {
  const base = { usage: [], inst: [], region: [], target: [], query: '', sort: null } as const;

  it('같은 패세트 내 선택은 OR', () => {
    const r = filterLoans(rows, { ...base, usage: ['주거', '운영'] });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 2, 3]);
  });
  it('패세트 간 선택은 AND', () => {
    const r = filterLoans(rows, { ...base, usage: ['주거'], inst: ['시중은행'] });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 3]);
  });
  it('상품명 검색(대소문자 무시 부분일치)', () => {
    const r = filterLoans(rows, { ...base, query: '주거' });
    expect(r.map((x) => x.seq)).toEqual([3]);
  });
  it('한도 내림차순 정렬', () => {
    const r = filterLoans(rows, { ...base, sort: 'limitDesc' });
    expect(r.map((x) => x.lnlmt)).toEqual([5000, 3000, 2000]);
  });
});
