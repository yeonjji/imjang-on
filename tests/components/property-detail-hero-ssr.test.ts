import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PropertyDetailHero } from '@/app/(public)/apt/[id]/_components/property-detail-hero';
import { PropertyType } from '@prisma/client';
import type { Property, Region } from '@prisma/client';

(globalThis as unknown as { React: typeof React }).React = React;

const region = {
  code: '1171000000',
  sido: '서울특별시',
  sigungu: '송파구',
  eupmyeondong: null,
  ri: null,
  fullName: '서울특별시 송파구',
  level: 2,
  parentCode: null,
  isAbolished: false,
  abolishedAt: null,
  sourceVersion: 'ut',
  updatedAt: new Date('2026-01-01'),
  sigunguCode: '11710',
} as Region;

function makeProperty(address: string): Property {
  return {
    id: 1n,
    propertyType: PropertyType.APARTMENT,
    name: '헬리오시티',
    nameNorm: '헬리오시티',
    regionCode: '1171000000',
    address,
    builtYear: 2018,
    households: 9510,
    buildingCount: null,
    areaTypes: [],
    txCountTotal: 0,
    txCount12m: 12,
    lastTxAt: null,
    saleCount12m: 0,
    saleAvgPrice12m: null,
    saleLastPrice: null,
    saleLastAt: null,
    jeonseCount12m: 0,
    jeonseAvgDeposit12m: null,
    jeonseLastDeposit: null,
    jeonseLastAt: null,
    wolseCount12m: 0,
    wolseAvgDeposit12m: null,
    wolseAvgRent12m: null,
    wolseLastDeposit: null,
    wolseLastRent: null,
    wolseLastAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sigunguCode: '11710',
    redirectToId: null,
  } as unknown as Property;
}

describe('PropertyDetailHero 지역 표기', () => {
  it('지번이 확정이면 전체 지번주소를 표기한다', () => {
    const html = renderToStaticMarkup(
      createElement(PropertyDetailHero, {
        property: makeProperty('가락동 913'),
        region,
        confirmed: true,
      }),
    );
    expect(html).toContain('서울특별시 송파구 가락동 913');
  });

  it('지번이 미확정이면 히어로에는 지번을 내보내지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(PropertyDetailHero, {
        property: makeProperty('가락동 913'),
        region,
        confirmed: false,
      }),
    );
    expect(html).toContain('서울특별시 송파구 가락동');
    expect(html).not.toContain('가락동 913');
  });

  it('지번이 비정형이면 법정동까지만 표기한다', () => {
    const html = renderToStaticMarkup(
      createElement(PropertyDetailHero, {
        property: makeProperty('가락동 가-'),
        region,
        confirmed: false,
      }),
    );
    expect(html).toContain('서울특별시 송파구 가락동');
    expect(html).not.toContain('가-');
  });
});
