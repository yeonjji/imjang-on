import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import { ParkingFeeCompare } from '@/app/(public)/urban/[category]/_components/parking-fee-compare';
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

describe('ParkingFeeCompare', () => {
  it('30분 요금과 월정기권을 중앙값과 나란히', () => {
    const html = renderToStaticMarkup(
      createElement(ParkingFeeCompare, {
        cmp: { own30: 1500, median30: 600, count30: 3, ownMonthly: 100000, medianMonthly: 80000, countMonthly: 3 },
        scope: '평택시',
      }),
    );
    expect(html).toContain('1,500원');
    expect(html).toContain('평택시 공영주차장 중앙값 600원');
    expect(html).toContain('100,000원');
  });
  it('중앙값이 없는 지표는 타일을 숨기고, 다 없으면 렌더하지 않는다', () => {
    const none = { own30: 1500, median30: null, count30: 1, ownMonthly: null, medianMonthly: null, countMonthly: 0 };
    expect(renderToStaticMarkup(createElement(ParkingFeeCompare, { cmp: none, scope: '평택시' }))).toBe('');
  });
});
