import { formatAsOf } from '@/lib/format';
import { formatLoanRate, isBulletRepayment, parseLoanRate, type LoanRateSpec } from '@/lib/loan/rate';

export interface LoanCalculatorConfig {
  rate: LoanRateSpec;
  /** 원문 금리(표시용, % 부착). 금리가 비어 있으면 null. */
  rateText: string | null;
  limitManwon: number | null;
  variableRate: boolean;
  /** 상환방식에 분할·혼합이 함께 적혀 있어 '만기일시상환을 고른 경우'로 계산함을 밝혀야 하는가. */
  mixedRepayment: boolean;
  sourceLine: string;
}

interface LoanLike {
  irt: string | null;
  irtCtg: string | null;
  lnlmt: number | null;
  rawJson: unknown;
  updatedAt: Date;
}

const has = (s: string | null | undefined): s is string => !!s && s.trim() !== '' && s.trim() !== '-';

/**
 * 서민금융 상세의 '대출 이자 계산기' 노출 판정과 props. 만기일시상환이 확인되는 상품만, 무이자는 제외.
 * 설계: docs/superpowers/specs/2026-11-03-loan-interest-calculator-design.md §3·§4
 */
export function loanCalculatorConfig(p: LoanLike): LoanCalculatorConfig | null {
  const raw = (p.rawJson ?? {}) as Record<string, unknown>;
  const rdpt = typeof raw.rdptmthd === 'string' ? raw.rdptmthd : null;
  if (!isBulletRepayment(rdpt)) return null;
  if (has(p.irt) && p.irt.trim() === '0') return null;
  if (p.irtCtg?.includes('무이자')) return null;

  const rate = parseLoanRate(p.irt);
  const asOf = formatAsOf(p.updatedAt);
  return {
    rate,
    rateText: has(p.irt) ? formatLoanRate(p.irt) : null,
    limitManwon: p.lnlmt != null && p.lnlmt > 0 ? p.lnlmt : null,
    variableRate: !!p.irtCtg?.includes('변동'),
    mixedRepayment: /분할|혼합/.test(rdpt ?? ''),
    sourceLine: `${rate.kind === 'manual' ? '상품 안내 금리' : '금리'}: 서민금융진흥원 대출상품한눈에 · 수집일 ${asOf}`,
  };
}
