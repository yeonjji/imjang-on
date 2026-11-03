import { decodeEntities } from '@/lib/text/decode-entities';

// 서민금융진흥원 대출상품한눈에(B553701/LoanProductSearchingInfo) `irt`의 원천 정의는 '금리(연, %)'다
// (공공데이터포털 15106208 Swagger, 2026-11-03 확인). 값에는 %가 없이 "3.47"·"2.1~2.9"처럼 온다.
const NUMERIC_RATE = /^[\d.,~\s]+$/;

/** 순수 숫자·범위형(`~` 포함) 금리인가. 설명형("은행금리-1.8")·단위 포함("연 2.0%")은 false. */
export function isNumericRate(irt: string): boolean {
  return NUMERIC_RATE.test(decodeEntities(irt.trim()));
}

/** 표시용 금리. 순수 숫자·범위형에만 %를 붙이고, 그 외는 원문 그대로. */
export function formatLoanRate(irt: string): string {
  const s = decodeEntities(irt.trim());
  return NUMERIC_RATE.test(s) ? `${s}%` : s;
}
