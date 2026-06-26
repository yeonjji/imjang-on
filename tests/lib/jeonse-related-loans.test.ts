import { describe, it, expect } from 'vitest';
import { relatedLoansForJeonse } from '@/lib/jeonse/related-loans';
import type { LoanSummary } from '@/lib/loan/list';

function loan(partial: Partial<LoanSummary> & { seq: number; finprdnm: string }): LoanSummary {
  return {
    ofrinstnm: null,
    instCtg: null,
    lnlmt: null,
    irt: null,
    usageTags: [],
    targetTags: [],
    regionTags: [],
    ...partial,
  };
}

describe('relatedLoansForJeonse', () => {
  it('주거(전세) 목적 대출을 연관으로 고르고 무관 대출은 제외한다', () => {
    const all = [
      loan({ seq: 1, finprdnm: '버팀목전세자금', usageTags: ['전세', '보증금'] }),
      loan({ seq: 2, finprdnm: '창업운영자금', usageTags: ['창업', '운영'] }),
    ];
    const result = relatedLoansForJeonse(
      { rcmdProdNm: '일반전세자금보증', grntReqTrgtDvcd: '00', maxLoanLmtAmt: 200_000_000 },
      all,
      3,
    );
    expect(result.map((r) => r.seq)).toEqual([1]);
    expect(result[0].reasons.some((x) => x.kind === 'usage')).toBe(true);
    expect(result[0].summaryLine.length).toBeGreaterThan(0);
  });

  it('청년 대상(01)이면 청년 대출이 가점되어 상위로 온다', () => {
    const all = [
      loan({ seq: 1, finprdnm: '일반전세대출', usageTags: ['전세'] }),
      loan({ seq: 2, finprdnm: '청년전세대출', usageTags: ['전세'], targetTags: ['청년'] }),
    ];
    const result = relatedLoansForJeonse(
      { rcmdProdNm: 'x', grntReqTrgtDvcd: '01', maxLoanLmtAmt: null },
      all,
      3,
    );
    expect(result[0].seq).toBe(2);
  });

  it('대출 목록이 비면 빈 배열을 반환한다', () => {
    const result = relatedLoansForJeonse(
      { rcmdProdNm: 'x', grntReqTrgtDvcd: '00', maxLoanLmtAmt: null },
      [],
      3,
    );
    expect(result).toEqual([]);
  });
});
