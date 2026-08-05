import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardPagination } from '@/app/(public)/board/_components/board-pagination';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (board-briefing-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

/** 실제 페이지와 같은 방식으로 category·preview 토큰을 보존하는 href 빌더. */
function hrefFor(page: number, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/board?${qs}` : '/board';
}

function render(props: Partial<Parameters<typeof BoardPagination>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(BoardPagination, {
      current: 1,
      totalPages: 4,
      totalItems: 48,
      perPage: 12,
      hrefFor: (p: number) => hrefFor(p),
      ...props,
    }),
  );
}

describe('BoardPagination SSR', () => {
  // 회귀: 기존 pageNums(current±2)는 1페이지에서 1·2·3만 만들어 4페이지가 통째로 숨었다.
  it('1페이지에서도 마지막 페이지까지 번호를 모두 렌더한다', () => {
    const html = render({ current: 1, totalPages: 4 });
    expect(html).toContain('href="/board"'); // 1페이지
    expect(html).toContain('href="/board?page=2"');
    expect(html).toContain('href="/board?page=3"');
    expect(html).toContain('href="/board?page=4"');
  });

  it('창 크기(5)만큼 채워 1페이지에서 1~5를 보여준다', () => {
    const html = render({ current: 1, totalPages: 9, totalItems: 108 });
    expect(html).toContain('href="/board?page=5"');
    expect(html).not.toContain('href="/board?page=6"'); // 창 밖 — 마지막 버튼으로만 접근
  });

  it('1페이지에서 이전은 링크가 아니고 다음은 2페이지로 간다', () => {
    const html = render({ current: 1, totalPages: 4 });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="다음 페이지" class');
    expect(html).toContain('href="/board?page=2"');
  });

  it('마지막 페이지에서 다음이 비활성이고 이전은 직전 페이지로 간다', () => {
    const html = render({ current: 4, totalPages: 4 });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('href="/board?page=3"');
  });

  it('현재 페이지에 aria-current를 표시한다', () => {
    const html = render({ current: 3, totalPages: 4 });
    expect(html).toContain('aria-current="page"');
  });

  it('category·preview 토큰을 페이지 링크에 보존한다', () => {
    const html = render({
      current: 1,
      totalPages: 4,
      hrefFor: (p: number) => hrefFor(p, { category: 'LOAN', preview: 'tok' }),
    });
    expect(html).toContain('href="/board?category=LOAN&amp;preview=tok&amp;page=2"');
  });

  it('페이지가 많으면 처음·마지막·±10 점프를 노출한다', () => {
    const html = render({ current: 12, totalPages: 30, totalItems: 360 });
    expect(html).toContain('aria-label="처음 페이지로"');
    expect(html).toContain('aria-label="마지막 페이지로"');
    expect(html).toContain('aria-label="10페이지 뒤로"');
    expect(html).toContain('aria-label="10페이지 앞으로"');
  });

  it('건수 캡션을 현재 페이지 구간으로 렌더한다', () => {
    const html = render({ current: 2, totalPages: 4, totalItems: 48, perPage: 12 });
    expect(html).toContain('13');
    expect(html).toContain('24');
    expect(html).toContain('표시중');
  });

  it('페이지가 1개면 아무것도 렌더하지 않는다', () => {
    expect(render({ current: 1, totalPages: 1, totalItems: 5 })).toBe('');
  });
});
