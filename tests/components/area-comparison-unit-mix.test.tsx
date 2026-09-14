import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AreaComparison } from '@/app/(public)/apt/[id]/_components/area-comparison';
import type { UnitMix } from '@/lib/insights/apt-complex';
import type { AreaSummaryItem } from '@/lib/transaction';

// 이 저장소의 vitest 설정은 esbuild classic JSX 변환을 쓰므로, .tsx 테스트에서
// JSX를 그대로 쓰려면 React가 전역에 있어야 한다(tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

// 캐스트 없이 완전한 객체를 만든다. 필드를 빠뜨리면 컴파일이 잡아 준다.
const AREAS: AreaSummaryItem[] = [
  {
    area: 34, lastPrice: 200000, avg12m: 195000, count12m: 12,
    avgPrior12m: 185000, countPrior12m: 10, changePct12m: 5.2,
    jeonseAvg12m: 107000, jeonseCount12m: 8, jeonseRatioPct: 55, gap12m: 90000,
  },
];

const MIX: UnitMix = {
  bands: [
    { label: '60㎡ 이하', units: 2854, pct: 30 },
    { label: '60~85㎡', units: 5132, pct: 54 },
    { label: '85~135㎡', units: 1500, pct: 16 },
    { label: '135㎡ 초과', units: 24, pct: 0 },
  ],
  smallMidPct: 84,
  dominant: { label: '60~85㎡', pct: 54 },
};

describe('AreaComparison — 단지 구성', () => {
  it('unitMix가 있으면 구성 줄을 보여준다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={MIX} />);
    expect(out).toContain('단지 구성');
    expect(out).toContain('60~85㎡');
    expect(out).toContain('54%');
  });

  it('unitMix가 있으면 출처를 표기한다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={MIX} />);
    expect(out).toContain('국토교통부');
  });

  it('unitMix가 null이면 구성 줄만 빠지고 기존 카드는 남는다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={null} />);
    expect(out).not.toContain('단지 구성');
    expect(out).toContain('면적별 실거래 비교');
  });

  it('unitMix가 null이면 출처도 표기하지 않는다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={null} />);
    expect(out).not.toContain('국토교통부');
  });

  it('pct 0인 밴드는 바에서 생략한다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} unitMix={MIX} />);
    expect(out).not.toContain('135㎡ 초과');
  });

  it('areas가 비어도 unitMix가 있으면 섹션이 뜬다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={[]} unitMix={MIX} />);
    expect(out).toContain('단지 구성');
  });
});
