import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddressLine } from '@/components/ui/address-line';

(globalThis as unknown as { React: typeof React }).React = React;

describe('AddressLine SSR', () => {
  it('확정 주소는 주소 텍스트와 출처를 내고 대표 지번 배지는 없다', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLine, { display: '서울특별시 송파구 가락동 913', confirmed: true }),
    );
    expect(html).toContain('서울특별시 송파구 가락동 913');
    expect(html).toContain('출처:');
    expect(html).toContain('국토교통부');
    expect(html).not.toContain('대표 지번');
    expect(html).not.toContain('여러 지번에 걸쳐');
  });

  it('미확정 주소는 대표 지번 배지와 안내 문구를 함께 낸다', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLine, { display: '광주광역시 남구 상대동 101', confirmed: false }),
    );
    expect(html).toContain('광주광역시 남구 상대동 101');
    expect(html).toContain('대표 지번');
    expect(html).toContain('이 단지의 거래는 여러 지번에 걸쳐 있습니다.');
  });
});
