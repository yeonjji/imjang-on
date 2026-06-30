import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환한다. 전역 shim.
(globalThis as unknown as { React: typeof React }).React = React;

describe('ArticleSummary SSR', () => {
  it('"핵심 요약" 라벨과 마크다운 불릿을 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(ArticleSummary, { markdown: '- 첫째 **키워드**\n- 둘째' }),
    );
    expect(html).toContain('핵심 요약');
    expect(html).toContain('첫째');
    expect(html).toContain('<aside');
    expect(html).toContain('<strong>키워드</strong>');
  });

  it('빈 마크다운이면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ArticleSummary, { markdown: '' }));
    expect(html).toBe('');
  });
});
