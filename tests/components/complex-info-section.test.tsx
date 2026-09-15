import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ComplexInfoSection } from '@/app/(public)/apt/[id]/_components/complex-info-section';
import type { ComplexFacts, UnitMix } from '@/lib/insights/apt-complex';

// 이 저장소의 vitest 설정은 esbuild classic JSX 변환을 쓰므로, .tsx 테스트에서
// JSX를 그대로 쓰려면 React가 전역에 있어야 한다(tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

const NOW = new Date('2026-09-09T00:00:00Z');
const EMPTY: ComplexFacts = {
  households: null, buildingCount: null, usedate: null, hallType: null,
  topFloor: null, baseFloor: null, area60: null, area85: null, area135: null,
  area136: null, parkingGround: null, parkingUnder: null, evGround: null,
  evUnder: null, elevator: null, cctv: null, builder: null, fetchedAt: null,
};
const HELIO: ComplexFacts = {
  ...EMPTY,
  households: 9510, buildingCount: 84,
  usedate: new Date('2018-12-28T00:00:00Z'),
  hallType: '혼합식', topFloor: 35, baseFloor: 3,
  parkingGround: 0, parkingUnder: 12096,
  evGround: 0, evUnder: 256, elevator: 384, cctv: 2685,
  builder: '현대건설,삼성물산,현대산업개발',
  fetchedAt: new Date('2026-09-08T00:00:00Z'),
};

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

const html = (f: ComplexFacts | null, unitMix?: UnitMix | null) =>
  renderToStaticMarkup(<ComplexInfoSection facts={f} unitMix={unitMix} now={NOW} />);

describe('ComplexInfoSection', () => {
  it('facts가 null이면 아무것도 렌더하지 않는다 — 빈 카드도 아니다', () => {
    expect(html(null)).toBe('');
  });

  it('타일이 2개면 섹션 전체를 숨긴다', () => {
    expect(html({ ...EMPTY, households: 500, usedate: new Date('2018-12-28T00:00:00Z') })).toBe('');
  });

  it('가공값을 보여준다 — 원자료가 아니다', () => {
    const out = html(HELIO);
    expect(out).toContain('1.27대');      // 세대당 주차
    expect(out).toContain('7년차');        // 준공 연차
    expect(out).toContain('25세대당');     // 승강기 — 384대가 아니라 밀도로
    expect(out).toContain('100세대당');    // EV·CCTV
    expect(out).not.toContain('12096');   // 원자료 주차 대수는 안 보여준다
    expect(out).not.toContain('384');     // 원자료 승강기 대수도 안 보여준다
  });

  it('전면 지하주차를 표기한다', () => {
    expect(html(HELIO)).toContain('전부 지하');
  });

  it('구조와 시공사를 보여준다', () => {
    const out = html(HELIO);
    expect(out).toContain('혼합식');
    expect(out).toContain('35층');
    expect(out).toContain('현대건설');
  });

  it('결측 타일은 렌더하지 않는다', () => {
    const noCctv = html({ ...HELIO, cctv: null });
    expect(noCctv).not.toContain('CCTV');
    expect(noCctv).toContain('1.27'); // 나머지는 그대로
  });

  it('출처와 수집 기준일을 표기한다', () => {
    const out = html(HELIO);
    expect(out).toContain('국토교통부');
    expect(out).toContain('2026-09-08');
  });
});

// 면적 구성은 「면적별 실거래 비교」에서 옮겨 왔다(2026-09-15).
// 거래가 없는 단지에서 "실거래 비교" 제목 아래 구성만 남던 796건을 없애기 위해서다.
describe('ComplexInfoSection — 면적 구성', () => {
  it('unitMix가 있으면 구성 막대를 보여준다', () => {
    const out = html(HELIO, MIX);
    expect(out).toContain('면적 구성');
    expect(out).toContain('60~85㎡');
    expect(out).toContain('54%');
  });

  it('pct 0인 밴드는 막대에서 생략한다', () => {
    expect(html(HELIO, MIX)).not.toContain('135㎡ 초과');
  });

  it('unitMix가 없으면 구성 막대만 빠지고 타일은 남는다', () => {
    const out = html(HELIO, null);
    expect(out).not.toContain('면적 구성');
    expect(out).toContain('1.27대');
  });

  // 회귀 방지: 타일이 3개 미만이라도 구성이 있으면 섹션을 띄운다.
  // 안 그러면 구성 막대가 이 섹션으로 옮겨 온 탓에 화면에서 통째로 사라진다(실측 23건).
  it('타일이 모자라도 면적 구성이 있으면 섹션이 뜬다', () => {
    const thin: ComplexFacts = {
      ...EMPTY,
      households: 9510,
      area60: 2854, area85: 5132, area135: 1500, area136: 24,
    };
    const out = html(thin, MIX);
    expect(out).toContain('면적 구성');
    expect(out).toContain('단지 정보');
  });
});
