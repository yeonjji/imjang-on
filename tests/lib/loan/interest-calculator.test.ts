import { describe, it, expect } from 'vitest';
import { parseLoanRate, isBulletRepayment } from '@/lib/loan/rate';
import {
  bulletInterest,
  sanitizeAmountInput,
  sanitizeRateInput,
  validateRate,
  manwonLabel,
  MAX_AMOUNT_MANWON,
} from '@/lib/loan/interest';
import { loanCalculatorConfig } from '@/lib/loan/calculator-config';

describe('parseLoanRate', () => {
  it('숫자 하나 → single', () => {
    expect(parseLoanRate('3.47')).toEqual({ kind: 'single', value: 3.47 });
    expect(parseLoanRate(' 2 ')).toEqual({ kind: 'single', value: 2 });
  });
  it('a~b → range(최저·최고)', () => {
    expect(parseLoanRate('2.1~2.9')).toEqual({ kind: 'range', min: 2.1, max: 2.9 });
    expect(parseLoanRate('3.052 ~ 3.72')).toEqual({ kind: 'range', min: 3.052, max: 3.72 });
  });
  it('상한만·설명형·% 포함·빈 값 → manual(임의 값 금지)', () => {
    for (const s of ['~3.28', '은행금리-1.8', '기준금리 + 2.5', '연 2.51% (국고채…)', '은행별 상이', '', null]) {
      expect(parseLoanRate(s)).toEqual({ kind: 'manual' });
    }
  });
  it('최저>최고, 30% 초과, 0은 자동 적용하지 않는다', () => {
    expect(parseLoanRate('3.0~2.0')).toEqual({ kind: 'manual' });
    expect(parseLoanRate('31')).toEqual({ kind: 'manual' });
    expect(parseLoanRate('0')).toEqual({ kind: 'manual' });
  });
});

describe('isBulletRepayment', () => {
  it("상환방식에 '일시'가 있으면 true", () => {
    expect(isBulletRepayment('만기일시상환')).toBe(true);
    expect(isBulletRepayment('일시상환(1회에 한해 2년 연장 가능)')).toBe(true);
    expect(isBulletRepayment('만기일시상환, 혼합상환')).toBe(true);
  });
  it('분할만·빈 값·- 은 false', () => {
    for (const s of ['원금균등분할상환', '-', '', null, undefined]) expect(isBulletRepayment(s)).toBe(false);
  });
});

describe('loanCalculatorConfig (서민금융 노출 판정)', () => {
  const base = {
    irt: '2.1~2.9',
    irtCtg: '변동금리',
    lnlmt: null,
    rawJson: { rdptmthd: '만기일시상환, 혼합상환 (4회 연장가능)' },
    updatedAt: new Date('2026-11-01T11:00:18Z'),
  };
  it('만기일시 + 범위 금리 → 범위 칩·변동·혼합 표시', () => {
    const c = loanCalculatorConfig(base)!;
    expect(c.rate).toEqual({ kind: 'range', min: 2.1, max: 2.9 });
    expect(c.variableRate).toBe(true);
    expect(c.mixedRepayment).toBe(true);
    expect(c.rateText).toBe('2.1~2.9%');
    expect(c.sourceLine).toBe('금리: 서민금융진흥원 대출상품한눈에 · 수집일 2026.11.01');
  });
  it('비정형 금리는 manual + 원문 + 상품 안내 금리 출처', () => {
    const c = loanCalculatorConfig({ ...base, irt: '은행금리-1.8', lnlmt: 50000, rawJson: { rdptmthd: '만기일시상환' } })!;
    expect(c.rate).toEqual({ kind: 'manual' });
    expect(c.rateText).toBe('은행금리-1.8');
    expect(c.limitManwon).toBe(50000);
    expect(c.mixedRepayment).toBe(false);
    expect(c.sourceLine?.startsWith('상품 안내 금리:')).toBe(true);
  });
  it('분할상환 전용·무이자는 미노출(null)', () => {
    expect(loanCalculatorConfig({ ...base, rawJson: { rdptmthd: '원금균등분할상환' } })).toBeNull();
    expect(loanCalculatorConfig({ ...base, irt: '0' })).toBeNull();
    expect(loanCalculatorConfig({ ...base, irt: '1', irtCtg: '무이자' })).toBeNull();
  });
  it('금리가 비어 있으면 원문 없이 직접 입력', () => {
    const c = loanCalculatorConfig({ ...base, irt: null })!;
    expect(c.rate).toEqual({ kind: 'manual' });
    expect(c.rateText).toBeNull();
  });
});

describe('bulletInterest', () => {
  it('설계 검증값과 일치(원 단위 반올림)', () => {
    expect(bulletInterest(20000, 2.9, 2)).toEqual({ monthly: 483333, annual: 5800000, total: 11600000 });
    expect(bulletInterest(10000, 3.47, 2)).toEqual({ monthly: 289167, annual: 3470000, total: 6940000 });
  });
});

describe('입력 검증', () => {
  it('금액: 숫자만, 최대 자릿수 초과 입력은 거부', () => {
    expect(sanitizeAmountInput('1,5000원', '')).toBe('15,000');
    expect(sanitizeAmountInput('', '100')).toBe('');
    expect(sanitizeAmountInput('0012', '')).toBe('12');
    expect(sanitizeAmountInput(String(MAX_AMOUNT_MANWON) + '0', '1,000')).toBe('1,000');
    expect(sanitizeAmountInput(String(MAX_AMOUNT_MANWON + 1), '1,000')).toBe('1,000');
  });
  it('금리: 정수 2자리·소수 2자리까지, 점 하나', () => {
    expect(sanitizeRateInput('3.47', '')).toBe('3.47');
    expect(sanitizeRateInput('3.475', '3.47')).toBe('3.47');
    expect(sanitizeRateInput('123', '12')).toBe('12');
    expect(sanitizeRateInput('3..5', '3.')).toBe('3.');
    expect(sanitizeRateInput('3,5%', '')).toBe('35');
    expect(sanitizeRateInput('.5', '')).toBe('0.5');
  });
  it('금리 범위 0.01~30', () => {
    expect(validateRate(0)).toBe('out-of-range');
    expect(validateRate(30.01)).toBe('out-of-range');
    expect(validateRate(0.01)).toBe('ok');
    expect(validateRate(30)).toBe('ok');
  });
  it('만원 → 읽기 문구', () => {
    expect(manwonLabel(15000)).toBe('1억 5,000만원');
    expect(manwonLabel(20000)).toBe('2억원');
    expect(manwonLabel(5000)).toBe('5,000만원');
  });
});
