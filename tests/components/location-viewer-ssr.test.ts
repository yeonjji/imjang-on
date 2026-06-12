import { describe, it, expect, beforeAll } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocationViewer } from '@/components/ui/location-viewer';

// 컴포넌트는 Next 자동 JSX 런타임(React import 없음)을 쓰지만 vitest(esbuild)는
// classic 런타임으로 변환해 React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.
(globalThis as unknown as { React: typeof React }).React = React;

// SSR 마크업(=Googlebot이 보는 초기 HTML)에 정적 지도 poster <img>가 들어가는지 검증.
// effect는 renderToStaticMarkup에서 실행되지 않으므로 네이버 JS 지도 없이 순수 SSR 출력만 본다.
describe('LocationViewer SSR poster', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID = 'test-client-id';
  });

  it('clientId가 있으면 /api/staticmap poster <img>를 SSR 마크업에 포함한다', () => {
    const html = renderToStaticMarkup(
      createElement(LocationViewer, { lat: 37.42, lng: 127.13, name: '성남시청' }),
    );
    // src의 & 는 SSR에서 &amp; 로 이스케이프된다.
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/staticmap?lat=37.42&amp;lng=127.13');
    expect(html).toContain('alt="성남시청 위치 지도"');
    expect(html).toContain('absolute inset-0');
  });
});
