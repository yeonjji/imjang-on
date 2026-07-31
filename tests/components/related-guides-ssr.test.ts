import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelatedGuidesView } from '@/app/(public)/_components/related-guides';
import type { RelatedGuideItem } from '@/lib/guide/queries';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(hospital-tabs-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

describe('RelatedGuidesView SSR', () => {
  it('가이드가 있으면 헤딩·제목·/guide/{slug} 링크를 렌더한다', () => {
    const items: RelatedGuideItem[] = [
      { id: 1n, slug: 'night-hospital', title: '야간·공휴일 병원 찾기' },
      { id: 2n, slug: 'pick-department', title: '진료과 선택하는 법' },
    ];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toContain('관련 가이드');
    expect(html).toContain('야간·공휴일 병원 찾기');
    expect(html).toContain('href="/guide/night-hospital"');
    expect(html).toContain('href="/guide/pick-department"');
  });

  it('가이드가 없으면 아무것도 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items: [] }));
    expect(html).toBe('');
  });

  it('섹션 전체를 Card(흰 배경 + shadow-soft)로 감싼다', () => {
    const items: RelatedGuideItem[] = [{ id: 1n, slug: 'a', title: '가이드 A' }];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toMatch(/^<div class="[^"]*bg-\[var\(--color-card\)\]/);
    expect(html).toMatch(/^<div class="[^"]*shadow-\[var\(--shadow-soft\)\]/);
  });

  it('안쪽 타일은 흰 카드가 아니라 연한 배경을 쓴다', () => {
    const items: RelatedGuideItem[] = [{ id: 1n, slug: 'a', title: '가이드 A' }];
    const html = renderToStaticMarkup(createElement(RelatedGuidesView, { items }));
    expect(html).toContain('bg-[var(--color-soft)]');
    expect(html).not.toContain('bg-white');
  });
});
