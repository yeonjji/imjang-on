import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardBriefingView } from '@/app/(public)/_components/board-briefing-section';
import type { HomePostItem } from '@/lib/board/post';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (related-guides-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const posts: HomePostItem[] = [
  {
    id: 1n,
    slug: 'busan-center',
    title: '부산 서민금융 복합지원센터 개소',
    summary: '',
    category: 'LOAN',
    sourceName: '정책브리핑',
    // 로컬 타임존 기준으로 고정(UTC 문자열은 shortDate가 TZ에 따라 밀린다)
    publishedAt: new Date(2026, 6, 30),
  },
];

describe('BoardBriefingView SSR', () => {
  it('헤딩·카테고리 배지·제목·/board/{id} 링크를 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toContain('최신 부동산·청약·금융 소식');
    expect(html).toContain('부산 서민금융 복합지원센터 개소');
    expect(html).toContain('대출'); // categoryLabel('LOAN')
    expect(html).toContain('href="/board/1"');
  });

  it('heading prop으로 제목을 갈아끼울 수 있다', () => {
    const html = renderToStaticMarkup(
      createElement(BoardBriefingView, { posts, heading: '임장ON 브리핑' }),
    );
    expect(html).toContain('임장ON 브리핑');
    expect(html).not.toContain('최신 부동산·청약·금융 소식');
  });

  it('섹션 전체를 Card(흰 배경 + shadow-soft)로 감싼다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toMatch(/^<div class="[^"]*bg-\[var\(--color-card\)\]/);
    expect(html).toMatch(/^<div class="[^"]*shadow-\[var\(--shadow-soft\)\]/);
  });

  it('타일은 연한 배경, 카테고리 배지는 흰 배경으로 대비를 유지한다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toContain('bg-[var(--color-soft)]');
    expect(html).toContain('rounded-full bg-white');
  });

  it('글이 없으면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts: [] }));
    expect(html).toBe('');
  });

  it('타일 메타 라인은 연한 배경에서 AA를 만족하는 색을 쓴다', () => {
    const html = renderToStaticMarkup(createElement(BoardBriefingView, { posts }));
    expect(html).toContain('text-[var(--color-muted-on-soft)]');
    expect(html).not.toContain('pt-3 text-xs text-[var(--color-muted)]');
  });
});
