import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyButton } from '@/components/ui/copy-button';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.
(globalThis as unknown as { React: typeof React }).React = React;

// 클립보드 지원 여부는 마운트 후에만 알 수 있으므로 SSR 출력에는 버튼이 없어야 한다.
// (동작하지 않는 버튼을 서버에서 그려놓고 나중에 죽이지 않는다)
describe('CopyButton SSR', () => {
  it('서버 렌더 시에는 아무것도 출력하지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { value: '서울특별시 송파구 가락동 913', label: '주소 복사' }),
    );
    expect(html).toBe('');
  });
});
