import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// HeroSearch(자식)가 next/navigation의 useRouter를 쓴다. renderToStaticMarkup은
// App Router 컨텍스트 없이 호출되므로 실제 훅을 그대로 두면 "invariant expected
// app router to be mounted"로 죽는다. router.push만 있으면 되므로 최소로 스텁한다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { HeroSection } from '@/app/(public)/_components/hero-section';

(globalThis as unknown as { React: typeof React }).React = React;

const html = (panelSlot: React.ReactNode) =>
  renderToStaticMarkup(
    <HeroSection
      popularRegions={[]}
      statsSlot={<div data-testid="stats">STATS_MARK</div>}
      panelSlot={panelSlot}
    />,
  );

describe('HeroSection', () => {
  it('panelSlot이 없으면(폴백) xl 2단 그리드 클래스를 켜지 않는다', () => {
    const out = html(null);
    expect(out).not.toContain('xl:grid-cols-');
  });

  it('panelSlot이 있으면 xl 2단 그리드 클래스를 켜고 패널을 렌더한다', () => {
    const out = html(<div data-testid="panel">PANEL_MARK</div>);
    expect(out).toContain('xl:grid-cols-[1.65fr_1fr]');
    expect(out).toContain('PANEL_MARK');
  });

  it('왼쪽 열 순서는 검색 → 아이콘 → 통계다(스펙 §6.2)', () => {
    const out = html(null);
    // TypeIconGrid의 아이콘 라벨, statsSlot 마커의 등장 순서로 배치를 확인한다.
    const iconIdx = out.indexOf('EV충전소');
    const statsIdx = out.indexOf('STATS_MARK');
    expect(iconIdx).toBeGreaterThan(-1);
    expect(statsIdx).toBeGreaterThan(iconIdx);
  });

  it('popularRegions가 비어 있어도 렌더가 죽지 않는다', () => {
    expect(() => html(null)).not.toThrow();
  });
});
