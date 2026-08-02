import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityDetailSidebar } from '@/app/(public)/amenity/[category]/_components/amenity-detail-sidebar';
import { convenienceDef } from '@/lib/amenity/adapters/convenience';
import type { AmenityItem } from '@/lib/amenity/category';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (amenity-card-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const other: AmenityItem = {
  id: 2n,
  name: '미니스톱',
  address: '서울특별시 중구 소월로 12',
  sigunguCode: '11140',
  industryCode: 'G20405',
  industryName: '편의점',
  branchName: '서울역점',
};

describe('AmenityDetailSidebar 이름 표기', () => {
  it('같은 지역 다른 편의점 목록도 브랜드+지점명으로 표기한다', () => {
    const html = renderToStaticMarkup(
      createElement(AmenityDetailSidebar, { others: [other], def: convenienceDef, sigunguCode: '11140' }),
    );
    expect(html).toContain('미니스톱 서울역점');
    // 수정 전에는 branchName 없이 name만 노출해 '· 미니스톱' 뒤에 바로 태그가 닫혔다.
    expect(html).not.toContain('· 미니스톱<');
  });
});
