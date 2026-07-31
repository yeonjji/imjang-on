import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityCard } from '@/app/(public)/amenity/[category]/_components/amenity-card';
import { convenienceDef } from '@/lib/amenity/adapters/convenience';
import { cafeDef } from '@/lib/amenity/adapters/cafe';
import type { AmenityItem } from '@/lib/amenity/category';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (related-guides-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const base: AmenityItem = {
  id: 1n,
  name: '미니스톱',
  address: '서울특별시 중구 소월로 10',
  sigunguCode: '11140',
  industryCode: 'G20405',
  industryName: '편의점',
  branchName: '서울역점',
};

describe('AmenityCard 이름 표기', () => {
  it('편의점은 브랜드 뒤에 공백을 넣어 지점명을 보여준다', () => {
    const html = renderToStaticMarkup(createElement(AmenityCard, { item: base, def: convenienceDef }));
    expect(html).toContain('미니스톱 서울역점');
  });

  it('카페는 결합만 하고 공백을 넣지 않는다', () => {
    const item: AmenityItem = {
      ...base,
      name: '컴포즈커피서산',
      branchName: '석림점',
      industryCode: 'I21201',
      industryName: '카페',
    };
    const html = renderToStaticMarkup(createElement(AmenityCard, { item, def: cafeDef }));
    expect(html).toContain('컴포즈커피서산석림점');
  });

  it('branchName이 없으면 기존 이름 그대로다', () => {
    const item: AmenityItem = { ...base, name: '에이원', branchName: null };
    const html = renderToStaticMarkup(createElement(AmenityCard, { item, def: convenienceDef }));
    expect(html).toContain('에이원');
  });

  it('주소는 그대로 유지한다', () => {
    const html = renderToStaticMarkup(createElement(AmenityCard, { item: base, def: convenienceDef }));
    expect(html).toContain('서울특별시 중구 소월로 10');
  });
});
