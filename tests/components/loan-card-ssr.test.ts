import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoanCard } from '@/app/(public)/finance/_components/loan-card';
import type { LoanSummary } from '@/lib/loan/list';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (loan-explorer-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const base: LoanSummary = {
  seq: 1,
  finprdnm: '햇살론유스',
  ofrinstnm: '서민금융진흥원',
  instCtg: '공공기관',
  lnlmt: 1200,
  irt: '3.5',
  usageTags: ['생계'],
  targetTags: [],
  regionTags: [],
  operPeriod: '상시',
};

describe('LoanCard SSR', () => {
  it('그리드 행 높이를 채우도록 링크와 article 모두 h-full을 갖는다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toMatch(/<a [^>]*class="block h-full"/);
    expect(html).toMatch(/<article class="[^"]*\bh-full\b[^"]*\bflex-col\b/);
  });

  it('용도 배지 블록이 mt-auto로 카드 바닥에 정렬된다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toMatch(/<div class="mt-auto [^"]*"/);
    expect(html).toContain('생계');
  });

  it('용도 배지가 없는 상품은 mt-auto 블록 없이 렌더된다', () => {
    const html = renderToStaticMarkup(
      createElement(LoanCard, { item: { ...base, usageTags: [] } }),
    );
    expect(html).toContain('햇살론유스');
    expect(html).not.toContain('mt-auto');
  });

  it('기본 정보(기관·금리·한도·운영기간)를 그대로 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(LoanCard, { item: base }));
    expect(html).toContain('서민금융진흥원');
    expect(html).toContain('공공기관');
    expect(html).toContain('금리 3.5');
    expect(html).toContain('1,200');
    expect(html).toContain('상시');
    expect(html).toContain('href="/finance/1"');
  });
});
