import { describe, it, expect } from 'vitest';
import { collectFacets, filterLoans, type LoanSummary, type LoanFilterCriteria } from '@/lib/loan/list';

const rows: LoanSummary[] = [
  { seq: 1, finprdnm: '청년전세대출', ofrinstnm: 'A', instCtg: '시중은행', lnlmt: 2000, irt: '3', usageTags: ['주거'], targetTags: ['청년'], regionTags: ['전국'], operPeriod: null },
  { seq: 2, finprdnm: '소상공인 운영자금', ofrinstnm: 'B', instCtg: '지자체', lnlmt: 5000, irt: '2', usageTags: ['운영'], targetTags: ['소상공인'], regionTags: ['서울'], operPeriod: null },
  { seq: 3, finprdnm: '주거안정 자금', ofrinstnm: 'C', instCtg: '시중은행', lnlmt: 3000, irt: '1', usageTags: ['주거', '생계'], targetTags: ['청년', '근로자'], regionTags: ['전국', '서울'], operPeriod: null },
];

describe('collectFacets', () => {
  it('원본 태그를 우리 카테고리로 묶어 카운트한다', () => {
    const f = collectFacets(rows);
    // 주거(house): seq1,3 → 2건
    expect(f.usage).toContainEqual({ slug: 'house', label: '주거·전월세', count: 2 });
    // 시중은행 → 은행·금융(bank): seq1,3 → 2건
    expect(f.inst).toContainEqual({ slug: 'bank', label: '은행·금융', count: 2 });
    // 청년 → 청년·대학생(youth): seq1,3 → 2건
    expect(f.target).toContainEqual({ slug: 'youth', label: '청년·대학생', count: 2 });
    // 지역은 원본 시도값 유지
    expect(f.region).toContainEqual({ value: '전국', count: 2 });
  });
});

describe('filterLoans', () => {
  const base: LoanFilterCriteria = { usage: null, inst: null, target: null, region: null, query: '', sort: null };

  it('자금용도 카테고리 단일선택(주거)', () => {
    const r = filterLoans(rows, { ...base, usage: 'house' });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 3]);
  });
  it('차원 간 선택은 AND (주거 + 은행·금융)', () => {
    const r = filterLoans(rows, { ...base, usage: 'house', inst: 'bank' });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 3]);
  });
  it('지역 단일선택(시도값)', () => {
    const r = filterLoans(rows, { ...base, region: '서울' });
    expect(r.map((x) => x.seq).sort()).toEqual([2, 3]);
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
