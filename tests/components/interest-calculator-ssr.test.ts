import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InterestCalculator, type InterestCalculatorProps } from '@/components/ui/interest-calculator';

// vitest(esbuild) classic JSX 런타임용 shim (loan-card-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

const render = (p: InterestCalculatorProps) => renderToStaticMarkup(createElement(InterestCalculator, p));
const inputValue = (html: string, placeholder: string) =>
  new RegExp(`<input[^>]*placeholder="${placeholder}"[^>]*value="([^"]*)"`).exec(html)?.[1];

describe('InterestCalculator SSR — 서민금융(loan)', () => {
  it('단일 금리는 자동 입력하고 출처·수집일을 보여 준다', () => {
    const html = render({
      variant: 'loan',
      rate: { kind: 'single', value: 3.47 },
      rateText: '3.47%',
      limitManwon: 20000,
      sourceLine: '금리: 서민금융진흥원 대출상품한눈에 · 수집일 2026.11.01',
    });
    expect(html).toContain('대출 이자 계산기');
    expect(inputValue(html, '예: 3.5')).toBe('3.47');
    expect(html).toContain('상품 안내 금리 3.47%를 넣었습니다');
    expect(html).toContain('수집일 2026.11.01');
  });

  it('범위 금리는 최저·최고 칩, 기본은 최고', () => {
    const html = render({ variant: 'loan', rate: { kind: 'range', min: 2.1, max: 2.9 }, rateText: '2.1~2.9%', mixedRepayment: true, variableRate: true });
    expect(inputValue(html, '예: 3.5')).toBe('2.9');
    expect(html).toMatch(/aria-pressed="false"[^>]*>최저 2.1%/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>최고 2.9%/);
    expect(html).toContain('만기일시상환을 고른 경우');
    expect(html).toContain('변동금리 대출은');
  });

  it('비정형 금리는 빈 칸 + 원문 노출', () => {
    const html = render({ variant: 'loan', rate: { kind: 'manual' }, rateText: '은행금리-1.8' });
    expect(inputValue(html, '예: 3.5')).toBe('');
    expect(html).toContain("상품 안내 금리 &#x27;은행금리-1.8&#x27;는 숫자 하나로 정해지지 않아 자동으로 넣지 않았습니다");
  });

  it('상품 한도 초과 빠른선택은 비활성, 한도 칩·안내 노출', () => {
    const html = render({ variant: 'loan', rate: { kind: 'manual' }, limitManwon: 15000 });
    expect(html).toMatch(/disabled=""[^>]*>2억</);
    expect(html).toMatch(/disabled=""[^>]*>3억</);
    expect(html).not.toMatch(/disabled=""[^>]*>1억 5,000만</);
    expect(html).toContain('상품 한도 1억 5,000만');
    expect(html).toContain('이 상품 대출한도');
  });

  it('대출기간 기본 2년 + 계산을 위한 가정 명시, 금액은 빈 칸', () => {
    const html = render({ variant: 'loan', rate: { kind: 'single', value: 3 } });
    expect(html).toContain('(계산을 위한 가정)');
    expect(html).toMatch(/<option value="2" selected="">2년<\/option>/);
    expect(inputValue(html, '예: 10,000')).toBe('');
    expect(html).toContain('대출금액과 연 금리를 입력하면');
  });

  it("월 이자 차이를 '몇백~몇천 원'으로 단정하지 않는다", () => {
    const html = render({ variant: 'loan', rate: { kind: 'manual' } });
    expect(html).not.toMatch(/몇백|몇천/);
    expect(html).toContain('예상 금액');
  });
});

describe('InterestCalculator SSR — 맞춤 전세보증(jeonse)', () => {
  const html = render({ variant: 'jeonse', rate: { kind: 'manual' } });

  it('제목·직접 입력 안내, 금리 기본값 없음', () => {
    expect(html).toContain('전세대출 예상 이자 계산기');
    expect(inputValue(html, '예: 3.5')).toBe('');
    expect(html).toContain('이 보증상품에는 대출금리가 정해져 있지 않습니다');
  });

  it('보증한도를 대출금액에 연결하지 않는다(한도 칩·한도 안내 없음)', () => {
    expect(html).not.toContain('상품 한도');
    expect(html).not.toContain('이 상품 대출한도');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('보증한도와 별개로');
  });

  it('이자지원 미반영·변동금리 안내', () => {
    expect(html).toContain('우대금리·이자지원은 반영하지 않았습니다');
    expect(html).toContain('변동금리 대출은');
  });
});
