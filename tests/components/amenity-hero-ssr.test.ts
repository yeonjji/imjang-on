import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityHero } from '@/app/(public)/amenity/[category]/_components/amenity-hero';
import { convenienceDef } from '@/lib/amenity/adapters/convenience';
import type { AmenityItem } from '@/lib/amenity/category';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (amenity-card-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const item: AmenityItem = {
  id: 1n,
  name: '미니스톱',
  address: '서울특별시 중구 소월로 10',
  sigunguCode: '11140',
  industryCode: 'G20405',
  industryName: '편의점',
  branchName: '서울역점',
};

describe('AmenityHero 이름 표기', () => {
  it('편의점 H1은 브랜드 뒤에 공백을 넣어 지점명을 보여준다', () => {
    const html = renderToStaticMarkup(createElement(AmenityHero, { item, def: convenienceDef }));
    expect(html).toContain('미니스톱 서울역점');
  });
});
