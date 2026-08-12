import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceComparisonView } from '@/app/(public)/subscription/[id]/_components/price-comparison';
import type { SigunguMedian } from '@/lib/subscription/median-snapshot';

// 컴포넌트는 자동 JSX 런타임(React import 없음)을 쓰지만 vitest(esbuild)는 classic 런타임으로
// 변환해 React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(hospital-tabs-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

describe('PriceComparisonView SSR — label 폴백/표기', () => {
  // 이 필드가 생기기 전(라운드 2 이전)에 쓰인 스냅샷을 흉내낸다 — payload에 label이 아예 없다.
  it('label이 없으면 예전 문구("같은 시군구")로 폴백한다', () => {
    const local = { median: 55_800, count: 17_116 } as unknown as SigunguMedian;
    const html = renderToStaticMarkup(createElement(PriceComparisonView, { local }));
    expect(html).toContain('같은 시군구 실거래 시세');
    expect(html).toContain('17,116건');
  });

  // 빈 문자열도 옛 스냅샷과 마찬가지로 취급한다(방어적).
  it('label이 빈 문자열이면 예전 문구로 폴백한다', () => {
    const local: SigunguMedian = { median: 55_800, count: 17_116, label: '' };
    const html = renderToStaticMarkup(createElement(PriceComparisonView, { local }));
    expect(html).toContain('같은 시군구 실거래 시세');
  });

  // 실제 버그 재현: 팔달구 공고가 수원시 전체(17,116건)를 "같은 시군구"라고만 표기하면 마치
  // 팔달구 자체의 건수처럼 읽힌다. label이 있으면 "수원시"라고 정확히 밝힌다.
  it('label이 있으면 시군구 대신 그 이름을 쓴다', () => {
    const local: SigunguMedian = { median: 55_800, count: 17_116, label: '수원시' };
    const html = renderToStaticMarkup(createElement(PriceComparisonView, { local }));
    expect(html).toContain('같은 수원시 실거래 시세');
    expect(html).not.toContain('같은 시군구');
  });
});
