import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import { ParkFacilities } from '@/app/(public)/urban/[category]/_components/park-facilities';
import { UrbanHero } from '@/app/(public)/urban/[category]/_components/urban-hero';
import { parkDef, type ParkRaw } from '@/lib/urban/adapters/park';
import type { UrbanItem } from '@/lib/urban/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

function item(raw: Partial<ParkRaw>): UrbanItem<ParkRaw> {
  return { id: 1n, name: '테스트공원', address: '경기도 평택시 현덕면 장수리 264-18', sigunguCode: null, raw: { address: '경기도 평택시 현덕면 장수리 264-18', ...raw } as ParkRaw };
}

const filled = item({
  parkType: '근린공원',
  area: 58462,
  facilityPlay: '조합놀이대+그네',
  facilitySport: '야외헬스기구',
  facilityConvenience: '정자,의자',
  facilityCulture: null,
  designatedAt: new Date('2016-06-17T00:00:00Z'),
  managingOrg: '경기도 평택시청',
  tel: '031-8024-4248',
});
const empty = item({ parkType: null, area: null });

describe('ParkInfo', () => {
  it('새 행: 지정 고시일·관리기관·전화', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: filled }));
    expect(html).toContain('2016-06-17');
    expect(html).toContain('경기도 평택시청');
    expect(html).toContain('031-8024-4248');
  });

  it('값이 없는 행은 숨긴다 ("-" 금지), 주소는 남는다', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: empty }));
    expect(html).not.toContain('공원 유형');
    expect(html).not.toContain('면적');
    expect(html).not.toContain('관리기관');
    expect(html).not.toContain('>-<');
    expect(html).toContain('경기도 평택시 현덕면 장수리 264-18');
  });
});

describe('ParkFacilities', () => {
  it('값이 있는 묶음만 칩으로', () => {
    const html = renderToStaticMarkup(createElement(ParkFacilities, { item: filled }));
    expect(html).toContain('공원 시설');
    expect(html).toContain('놀이시설');
    expect(html).toContain('>그네<');
    expect(html).toContain('>의자<');
    expect(html).not.toContain('교양시설');
  });

  it('시설이 하나도 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ParkFacilities, { item: empty }))).toBe('');
  });
});

describe('UrbanHero summaryLine', () => {
  it('summaryLine이 있으면 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(UrbanHero, { item: filled, def: parkDef, summaryLine: '면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정' }),
    );
    expect(html).toContain('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정');
  });
});
