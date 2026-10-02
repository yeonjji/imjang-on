import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import type { UrbanItem } from '@/lib/urban/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const park = { id: 1n, name: 'p', address: '경기도 평택시 1', sigunguCode: null, raw: { address: '경기도 평택시 1', parkType: '근린공원', area: 58462 } as ParkRaw } as UrbanItem<ParkRaw>;

describe('ParkInfo 면적 순위', () => {
  it('순위가 있으면 행으로', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: park, areaRank: { rank: 15, total: 120, scope: '평택시 근린공원' } }));
    expect(html).toContain('평택시 근린공원 120곳 중 15위');
  });
  it('없으면 행 없음', () => {
    expect(renderToStaticMarkup(createElement(ParkInfo, { item: park }))).not.toContain('면적 순위');
  });
});
