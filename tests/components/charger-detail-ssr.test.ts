import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChargerAccessNotice } from '@/app/(public)/urban/charger/[id]/_components/charger-access-notice';
import { ChargerGuide } from '@/app/(public)/urban/charger/[id]/_components/charger-guide';
import { ChargerStatusTable } from '@/app/(public)/urban/charger/[id]/_components/charger-status-table';

// vitest(esbuild) classic 런타임 shim — copy-button-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

describe('ChargerAccessNotice', () => {
  it('제한이 있으면 사유와 함께 경고', () => {
    const html = renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: true, limitDetail: '거주자외 출입제한' }));
    expect(html).toContain('이용 제한');
    expect(html).toContain('거주자외 출입제한');
  });
  it('사유가 없으면 지어내지 않고 확인 안내', () => {
    const html = renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: true, limitDetail: null }));
    expect(html).toContain('운영기관에 이용 가능 여부를 확인하세요');
  });
  it('제한이 없거나 모르면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: false, limitDetail: null }))).toBe('');
    expect(renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: null, limitDetail: null }))).toBe('');
  });
});

const raw = {
  useTime: '08:00~20:00', parkingFree: true, floorType: 'B', floorNum: 2,
  facilityKind: 'H0', operatorTel: '1600-4047', locationDetail: 'B2(102동 3대, 104동 2대) 총 5대',
};
const units = [{ outputKw: 7, installYear: 2022 }, { outputKw: 50, installYear: 2017 }];

describe('ChargerGuide', () => {
  it('이용 시간·최대 출력·주차료·설치 위치 타일과 정보 행', () => {
    const html = renderToStaticMarkup(createElement(ChargerGuide, { raw, units }));
    expect(html).toContain('이용 안내');
    expect(html).toContain('08:00~20:00');
    expect(html).toContain('최대 50kW');
    expect(html).toContain('무료');
    expect(html).toContain('지하 2층');
    expect(html).toContain('공동주택시설');
    expect(html).toContain('1600-4047');
    expect(html).toContain('2017~2022년');
    expect(html).toContain('B2(102동 3대, 104동 2대) 총 5대');
  });
  it('값이 하나도 없으면 렌더하지 않는다', () => {
    const empty = { useTime: null, parkingFree: null, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null };
    expect(renderToStaticMarkup(createElement(ChargerGuide, { raw: empty, units: [] }))).toBe('');
  });
});

describe('ChargerStatusTable 출력', () => {
  it('충전기별 출력 표시', () => {
    const html = renderToStaticMarkup(
      createElement(ChargerStatusTable, { statId: 'PI707748', units: [{ chgerId: '01', chgerType: '04', isFast: true, outputKw: 100 }] }),
    );
    expect(html).toContain('100kW');
  });
});
