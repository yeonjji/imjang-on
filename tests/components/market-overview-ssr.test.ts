import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityInfo } from '@/app/(public)/amenity/[category]/_components/amenity-info';
import { marketDef } from '@/lib/amenity/adapters/market';
import type { AmenityItem } from '@/lib/amenity/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const filled: AmenityItem = {
  id: 1n,
  name: '장호원전통시장',
  address: '경기도 이천시 장호원읍 장감로77번길 14',
  sigunguCode: '41500',
  marketType: '상설장+4일장',
  storeCount: 64,
  openCycle: '4일+9일',
  establishedYear: 1955,
  products: '농산물+축산물+수산물',
  hasParking: true,
  hasToilet: true,
  tel: '031-643-1330',
  homepage: 'http://www.jmarket.org/',
  referenceDate: new Date('2025-11-10T00:00:00Z'),
};
const empty: AmenityItem = { id: 2n, name: '빈시장', address: '서울', sigunguCode: '11110' };

describe('AmenityInfo (전통시장)', () => {
  it('홈페이지는 새 창 외부 링크로', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: filled, def: marketDef, regionFullName: '경기도 이천시' }));
    expect(html).toContain('href="http://www.jmarket.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('빈 시장은 지역 행만 남고 "-" 값 행이 없다', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: empty, def: marketDef, regionFullName: '서울특별시 종로구' }));
    expect(html).toContain('서울특별시 종로구');
    expect(html).not.toContain('시장 유형');
  });
});
