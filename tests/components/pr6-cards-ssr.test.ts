import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import { ParkingFeeCompare } from '@/app/(public)/urban/[category]/_components/parking-fee-compare';
import { PharmacyNeighborhood } from '@/app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood';
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

describe('PharmacyNeighborhood', () => {
  it('연차·동 순서·일요일 진료와 그 기준 표기', () => {
    const html = renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: 20, openedYear: 2007, dong: { dong: '박달동', count: 7, openedRank: 2 }, sundayClinics: 2 }));
    expect(html).toContain('20년차');
    expect(html).toContain('박달동 약국 7곳');
    expect(html).toContain('개설 순 2번째');
    expect(html).toContain('2곳');
    expect(html).toContain('진료시간을 공개한 병·의원 기준');
  });
  it('일요일 진료 0곳은 "없음"으로 단정하지 않고 타일을 숨긴다', () => {
    const html = renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: 20, openedYear: 2007, dong: null, sundayClinics: 0 }));
    expect(html).not.toContain('일요일');
  });
  it('보여줄 게 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: null, openedYear: null, dong: null, sundayClinics: 0 }))).toBe('');
  });
});
