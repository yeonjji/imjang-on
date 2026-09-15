import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AreaComparison } from '@/app/(public)/apt/[id]/_components/area-comparison';
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

describe('AreaComparison', () => {
  it('실거래가 있으면 카드를 보여준다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} />);
    expect(out).toContain('면적별 실거래 비교');
    expect(out).toContain('34');
  });

  // 회귀 방지: 2026-09-14 실측에서 매매 거래가 없는 매칭 단지 796건(6.7%)이
  // "면적별 실거래 비교"라는 제목 아래 구성 막대만 띄우고 실거래는 한 줄도 없었다.
  // 면적 구성은 「단지 정보」 섹션으로 옮겼고, 이 카드는 실거래가 없으면 뜨지 않는다.
  it('실거래가 없으면 카드 전체가 사라진다 — 제목만 남기지 않는다', () => {
    expect(renderToStaticMarkup(<AreaComparison areas={[]} />)).toBe('');
  });

  it('면적 구성을 렌더하지 않는다 — 「단지 정보」 섹션이 담당한다', () => {
    const out = renderToStaticMarkup(<AreaComparison areas={AREAS} />);
    expect(out).not.toContain('면적 구성');
    expect(out).not.toContain('단지 구성');
  });
});
