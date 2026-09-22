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

const html = () => renderToStaticMarkup(<HeroSection popularRegions={[]} />);

describe('HeroSection', () => {
  // 2열 배치는 page.tsx의 래퍼가 정한다. 히어로가 스스로 그리드가 되면 자기 높이가
  // 옆 카드에 끌려가 아래에 죽은 여백이 생긴다(이 작업이 없애려는 바로 그 문제).
  it('스스로 2열 그리드가 되지 않는다', () => {
    const out = html();
    // 'grid-cols-'를 그대로 찾으면 TypeIconGrid 자신의 아이콘용 grid-cols-4와
    // 충돌해 항상 실패한다(이 작업 대상이 아닌 컴포넌트). 히어로가 실제로 켰던
    // 트리거 클래스(xl:grid-cols-[1.65fr_1fr])로 좁혀서 검사한다.
    expect(out).not.toContain('xl:grid-cols-');
  });

  it('통계를 품지 않는다 — 통계는 히어로 밖 전체폭 밴드로 갔다', () => {
    const out = html();
    expect(out).not.toContain('실거래 데이터');
    expect(out).not.toContain('생활편의시설');
  });

  it('검색·버튼·카테고리는 그대로 있다', () => {
    const out = html();
    expect(out).toContain('임장ON');
    expect(out).toContain('실거래가 찾기');
    expect(out).toContain('청약 일정 보기');
    expect(out).toContain('EV충전소');
  });

  it('popularRegions가 비어 있어도 렌더가 죽지 않는다', () => {
    expect(() => html()).not.toThrow();
  });
});
