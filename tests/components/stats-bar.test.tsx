import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { StatsBar } from '@/app/(public)/_components/stats-bar';

(globalThis as unknown as { React: typeof React }).React = React;

const STATS = { transactions: 7670000, properties: 278000, schools: 13000, lifeFacilities: 622000 };

describe('StatsBar', () => {
  // @4xl:는 container-type 조상이 없으면 조용히 무시된다 — 빌드도 린트도 통과하고
  // 폭이 1132px이어도 2열로 렌더된다. 그 조상을 컴포넌트가 직접 들고 있어야
  // 어디에 놓여도 깨지지 않는다.
  it('자기 컨테이너 컨텍스트를 스스로 갖는다', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    expect(out).toContain('@container');
  });

  it('컨테이너가 4열 그리드의 조상이다(형제가 아니다)', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    const container = out.indexOf('@container');
    const grid = out.indexOf('@4xl:grid-cols-4');
    expect(container).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(container);
  });

  it('네 항목과 출처 링크를 보여준다', () => {
    const out = renderToStaticMarkup(<StatsBar stats={STATS} />);
    expect(out).toContain('실거래 데이터');
    expect(out).toContain('아파트/오피스텔/다세대');
    expect(out).toContain('학교 정보');
    expect(out).toContain('생활편의시설');
    expect(out).toContain('/data-source');
  });
});
