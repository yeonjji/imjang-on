import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityInfo } from '@/app/(public)/amenity/[category]/_components/amenity-info';
import { MarketOverview } from '@/app/(public)/amenity/[category]/_components/market-overview';
import { MarketProducts } from '@/app/(public)/amenity/[category]/_components/market-products';
import { AmenityHero } from '@/app/(public)/amenity/[category]/_components/amenity-hero';
import { marketDef } from '@/lib/amenity/adapters/market';
import type { AmenityItem } from '@/lib/amenity/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const filled: AmenityItem = {
  id: 1n,
  name: '장호원전통시장',
  address: '경기도 이천시 장호원읍 장감로77번길 14',
  sigunguCode: '41500',
  marketType: '상설장+4일장',
  storeCount: 64,
  openCycle: '4일+9일',
  establishedYear: 1955,
  products: '농산물+축산물+수산물',
  hasParking: true,
  hasToilet: true,
  tel: '031-643-1330',
  homepage: 'http://www.jmarket.org/',
  referenceDate: new Date('2025-11-10T00:00:00Z'),
};
const empty: AmenityItem = { id: 2n, name: '빈시장', address: '서울', sigunguCode: '11110' };

describe('AmenityInfo (전통시장)', () => {
  it('홈페이지는 새 창 외부 링크로', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: filled, def: marketDef, regionFullName: '경기도 이천시' }));
    expect(html).toContain('href="http://www.jmarket.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('빈 시장은 지역 행만 남고 "-" 값 행이 없다', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: empty, def: marketDef, regionFullName: '서울특별시 종로구' }));
    expect(html).toContain('서울특별시 종로구');
    expect(html).not.toContain('시장 유형');
  });
});

describe('MarketOverview', () => {
  it('타일 4개: 점포 수, 개설 햇수, 장날 목록, 방문 편의 + 기준일', () => {
    const html = renderToStaticMarkup(createElement(MarketOverview, { item: filled, nowYear: 2026 }));
    expect(html).toContain('시장 한눈에');
    expect(html).toContain('64곳');
    expect(html).toContain('71년');
    expect(html).toContain('4·9일장');
    expect(html).toContain('매월 4·9·14·19·24·29일');
    expect(html).toContain('주차장·공중화장실');
    expect(html).toContain('2025-11-10');
    expect(html).not.toContain('다음 장날');
  });

  it('값이 하나도 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(MarketOverview, { item: empty, nowYear: 2026 }))).toBe('');
  });

  it('주차장·화장실이 모두 N이면 "없음"으로 표시', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, hasParking: false, hasToilet: false }, nowYear: 2026 }),
    );
    expect(html).toContain('주차장 없음 · 화장실 없음');
  });

  it('올해 개설한 시장은 "0년" 대신 "올해"', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, establishedYear: 2026 }, nowYear: 2026 }),
    );
    expect(html).toContain('올해');
    expect(html).not.toContain('>0년<');
  });

  it('주차장·화장실 중 하나라도 모르면 "없음"이라고 단정하지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, hasParking: false, hasToilet: null }, nowYear: 2026 }),
    );
    expect(html).not.toContain('>없음<');
    expect(html).toContain('주차장 없음 · 화장실 정보 없음');
  });

  it('낯선 개설 주기는 원문으로', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, openCycle: '상설' }, nowYear: 2026 }),
    );
    expect(html).toContain('상설');
  });
});

describe('MarketProducts', () => {
  it('품목을 칩으로', () => {
    const html = renderToStaticMarkup(createElement(MarketProducts, { item: filled }));
    expect(html).toContain('취급 품목');
    expect(html).toContain('>축산물<');
  });
  it('품목이 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(MarketProducts, { item: empty }))).toBe('');
  });
});

describe('AmenityHero summaryLine', () => {
  it('summaryLine이 있으면 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(AmenityHero, { item: filled, def: marketDef, summaryLine: '1955년 개설 · 점포 64곳 · 4·9일 장날' }),
    );
    expect(html).toContain('1955년 개설 · 점포 64곳 · 4·9일 장날');
  });
});
