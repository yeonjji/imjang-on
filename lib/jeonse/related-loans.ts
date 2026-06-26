import { recommendLoans, type RelatedLoan } from '@/lib/loan/related';
import type { LoanSummary } from '@/lib/loan/list';

/** 연관 대출 계산에 필요한 전세보증 상품 필드만. */
export interface JeonseProductForLoans {
  rcmdProdNm: string;
  grntReqTrgtDvcd: string | null;
  maxLoanLmtAmt: number | null;
}

/** 실제 대출과 충돌하지 않는 합성 상품 식별자(recommendLoans의 자기제외용). */
const JEONSE_SYNTHETIC_SEQ = -1;

/**
 * 전세보증 상품을 합성 LoanSummary로 변환해 연관 서민금융 대출을 고른다.
 * - 목적: 항상 '전세'(usageSlugs → 'house' 매칭).
 * - 대상: 01 청년 / 02 신혼부부 / 그 외 없음.
 * - lnlmt(만원)는 한도 근접 랭킹에만 쓰이므로 원→만원 환산.
 */
export function relatedLoansForJeonse(
  product: JeonseProductForLoans,
  allLoans: LoanSummary[],
  max = 3,
): RelatedLoan[] {
  const targetTags =
    product.grntReqTrgtDvcd === '01'
      ? ['청년']
      : product.grntReqTrgtDvcd === '02'
        ? ['신혼부부']
        : [];

  const synthetic: LoanSummary = {
    seq: JEONSE_SYNTHETIC_SEQ,
    finprdnm: product.rcmdProdNm,
    ofrinstnm: '한국주택금융공사',
    instCtg: null,
    lnlmt: product.maxLoanLmtAmt != null ? Math.round(product.maxLoanLmtAmt / 10_000) : null,
    irt: null,
    usageTags: ['전세'],
    targetTags,
    regionTags: [],
  };

  return recommendLoans(synthetic, allLoans, max);
}
