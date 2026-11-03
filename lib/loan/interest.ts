/**
 * 만기일시상환 이자 계산(브라우저에서 실행되는 순수 함수). 매달 같은 원금·같은 연 금리를 가정한
 * 단순 계산이라 실제 은행의 일할 계산과 다를 수 있다 — 화면에 '예상 금액'으로 표시한다.
 * 설계: docs/superpowers/specs/2026-11-03-loan-interest-calculator-design.md
 */

/** 대출금액 상한(만원). 100억원 — 7자리. 서민금융 최대 한도(수억원)를 충분히 넘는다. */
export const MAX_AMOUNT_MANWON = 1_000_000;
export const MIN_RATE = 0.01;
export const MAX_RATE = 30;
/** 대출기간 기본값(계산을 위한 가정). 상품 데이터와 무관하게 2년으로 통일. */
export const DEFAULT_TERM_YEARS = 2;
export const TERM_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const QUICK_AMOUNTS_MANWON = [5000, 10000, 15000, 20000, 30000] as const;

export interface InterestResult {
  monthly: number;
  annual: number;
  total: number;
}

/** amountManwon(만원) × ratePct(연 %) → 원 단위 반올림 월·연·기간 총이자. */
export function bulletInterest(amountManwon: number, ratePct: number, years: number): InterestResult {
  const annualExact = (amountManwon * 10_000 * ratePct) / 100;
  return {
    monthly: Math.round(annualExact / 12),
    annual: Math.round(annualExact),
    total: Math.round(annualExact * years),
  };
}

/** 금액 입력: 숫자만 남기고 천 단위 콤마. 상한을 넘는 입력은 받지 않고 직전 값을 유지한다. */
export function sanitizeAmountInput(next: string, prev: string): string {
  const digits = next.replace(/\D/g, '').replace(/^0+/, '');
  if (digits === '') return '';
  const n = Number(digits);
  if (n > MAX_AMOUNT_MANWON) return prev;
  return n.toLocaleString('ko-KR');
}

export function parseAmountInput(text: string): number {
  const n = Number(text.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 금리 입력: 숫자와 점 하나, 정수 2자리·소수 2자리까지. 형식을 넘는 입력은 직전 값을 유지한다. */
export function sanitizeRateInput(next: string, prev: string): string {
  let s = next.replace(/[^\d.]/g, '');
  if (s.startsWith('.')) s = `0${s}`;
  if (s === '') return '';
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(s)) return prev;
  return s;
}

export function validateRate(rate: number): 'ok' | 'out-of-range' {
  return rate >= MIN_RATE && rate <= MAX_RATE ? 'ok' : 'out-of-range';
}

/** 15000 → '1억 5,000만원', 20000 → '2억원', 5000 → '5,000만원'. */
export function manwonLabel(manwon: number): string {
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (rest) parts.push(`${rest.toLocaleString('ko-KR')}만`);
  return `${parts.join(' ')}원`;
}

export const formatWonAmount = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 금리에 delta(%p)를 더한 값. 부동소수 오차 방지를 위해 소수 둘째 자리로 맞춘다. */
export const addRate = (rate: number, delta: number) => Math.round((rate + delta) * 100) / 100;
