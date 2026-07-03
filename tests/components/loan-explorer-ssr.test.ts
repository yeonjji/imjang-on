import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoanExplorer } from '@/app/(public)/finance/_components/loan-explorer';
import type { LoanSummary, LoanFacets } from '@/lib/loan/list';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (hospital-tabs-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const facets: LoanFacets = { usage: [], inst: [], target: [], region: [] };
const rows: LoanSummary[] = Array.from({ length: 25 }, (_, i) => ({
  seq: i + 1,
  finprdnm: `E2E상품-${String(i + 1).padStart(2, '0')}`,
  ofrinstnm: null,
  instCtg: null,
  lnlmt: null,
  irt: null,
  usageTags: [],
  targetTags: [],
  regionTags: [],
  operPeriod: null,
}));

describe('LoanExplorer SSR 페이지네이션', () => {
  const html = renderToStaticMarkup(createElement(LoanExplorer, { rows, facets }));

  it('첫 페이지에 PER_PAGE(20)개만 렌더', () => {
    expect(html).toContain('E2E상품-01');
    expect(html).toContain('E2E상품-20');
    expect(html).not.toContain('E2E상품-21'); // 21번째는 2페이지
  });

  it('totalPages>1이면 페이지네이션 nav 렌더', () => {
    expect(html).toContain('페이지네이션'); // Pagination의 aria-label
  });
});
