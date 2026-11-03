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

export type LoanRateSpec =
  | { kind: 'single'; value: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'manual' };

/** 자동 적용 상한. 원천 숫자형 금리 최대값은 19.99(2026-11 실측) — 이를 넘으면 원천 오류로 보고 자동 적용하지 않는다. */
export const MAX_AUTO_RATE = 30;

const NUM = String.raw`\d+(?:\.\d+)?`;
const SINGLE = new RegExp(`^(${NUM})$`);
const RANGE = new RegExp(`^(${NUM})\\s*~\\s*(${NUM})$`);
const valid = (n: number) => n > 0 && n <= MAX_AUTO_RATE;

/**
 * 계산기에 자동으로 넣을 수 있는 금리인지 판정한다. 숫자 하나는 single, `a~b`는 최저·최고 range.
 * 상한만(`~3.28`)·설명형·% 포함·0·비정상 값은 manual — 임의 값을 넣지 않고 사용자가 직접 입력한다.
 */
export function parseLoanRate(irt: string | null): LoanRateSpec {
  const s = irt ? decodeEntities(irt.trim()) : '';
  const one = SINGLE.exec(s);
  if (one) {
    const v = Number(one[1]);
    return valid(v) ? { kind: 'single', value: v } : { kind: 'manual' };
  }
  const two = RANGE.exec(s);
  if (two) {
    const min = Number(two[1]);
    const max = Number(two[2]);
    return valid(min) && valid(max) && min <= max ? { kind: 'range', min, max } : { kind: 'manual' };
  }
  return { kind: 'manual' };
}

/** 상환방식(rdptmthd)에 만기일시·일시상환이 포함되는가. */
export function isBulletRepayment(rdptmthd: string | null | undefined): boolean {
  return typeof rdptmthd === 'string' && rdptmthd.includes('일시');
}
