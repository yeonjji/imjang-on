import { describe, it, expect } from 'vitest';
import { recommendLoans } from '@/lib/loan/related';
import type { LoanSummary } from '@/lib/loan/list';

function row(p: Partial<LoanSummary> & { seq: number }): LoanSummary {
  return {
    finprdnm: `상품${p.seq}`,
    ofrinstnm: null,
    instCtg: null,
    lnlmt: null,
    irt: null,
    usageTags: [],
    targetTags: [],
    regionTags: [],
    ...p,
  };
}

// P(seq 1): 주거(house) + 청년(youth) + 서울
const rows: LoanSummary[] = [
  row({ seq: 1, usageTags: ['주거'], targetTags: ['청년'], regionTags: ['서울'], lnlmt: 3000 }),
  row({ seq: 2, usageTags: ['전세'], targetTags: ['청년'], regionTags: ['서울'], lnlmt: 3200, irt: '연 1.2~2.1%' }), // house+youth+region → 5
  row({ seq: 3, usageTags: ['주거'], targetTags: ['근로자'], regionTags: ['부산'], lnlmt: 9000 }), // house만 → 2
  row({ seq: 4, usageTags: ['창업'], targetTags: ['소상공인'], regionTags: ['서울'], lnlmt: 5000 }), // 지역만 → 비자격
  row({ seq: 7, usageTags: ['월세'], targetTags: ['청년'], regionTags: ['대구'], lnlmt: 3050 }), // house+youth → 4
];

describe('recommendLoans', () => {
  it('현재 상품을 결과에서 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.some((x) => x.seq === 1)).toBe(false);
  });

  it('점수 내림차순(목적·대상·지역)으로 정렬하고 자격 미달은 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.map((x) => x.seq)).toEqual([2, 7, 3]);
  });

  it('지역·한도만 겹치면 제외한다', () => {
    const r = recommendLoans(rows[0], rows);
    expect(r.some((x) => x.seq === 4)).toBe(false);
  });

  it('max 개수로 자른다', () => {
    const r = recommendLoans(rows[0], rows, 2);
    expect(r.map((x) => x.seq)).toEqual([2, 7]);
  });

  it("target 'etc'만 공유하면 제외한다", () => {
    const p = row({ seq: 10, targetTags: ['미분류항목'] });
    const c = row({ seq: 11, targetTags: ['또다른미분류'] });
    expect(recommendLoans(p, [p, c])).toEqual([]);
  });

  it('자격 후보가 없으면 빈 배열', () => {
    const p = row({ seq: 20, usageTags: ['주거'], targetTags: ['청년'] });
    const c = row({ seq: 21, usageTags: ['창업'], targetTags: ['소상공인'] });
    expect(recommendLoans(p, [p, c])).toEqual([]);
  });

  it('reasons는 usage 우선·최대 2개', () => {
    const r = recommendLoans(rows[0], rows);
    const c2 = r.find((x) => x.seq === 2)!;
    expect(c2.reasons.map((x) => x.label)).toEqual([
      '같은 목적·주거·전월세',
      '같은 대상·청년·대학생',
    ]);
  });

  it('summaryLine은 usage·target 라벨 조합', () => {
    const r = recommendLoans(rows[0], rows);
    const c2 = r.find((x) => x.seq === 2)!;
    expect(c2.summaryLine).toBe('주거·전월세 · 청년·대학생 대상');
  });

  it('여러 카테고리 라벨을 정의 순서로 정렬한다(입력 태그 순서 무관)', () => {
    const p = row({ seq: 30, usageTags: ['주거', '창업'], targetTags: ['청년'] });
    const c = row({ seq: 31, usageTags: ['창업', '주거'], targetTags: ['청년'] }); // 태그 입력 순서 뒤집힘
    const r = recommendLoans(p, [p, c]);
    const got = r.find((x) => x.seq === 31)!;
    // USAGE_CATEGORIES 정의 순서: biz(창업·운영) → house(주거·전월세)
    expect(got.summaryLine).toBe('창업·운영·주거·전월세 · 청년·대학생 대상');
    expect(got.reasons.map((x) => x.label)).toEqual([
      '같은 목적·창업·운영',
      '같은 목적·주거·전월세',
    ]);
  });
});
