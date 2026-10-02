import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/urban/ev-status', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/urban/ev-status')>();
  return { ...actual, fetchChargerStatus: vi.fn() };
});

import { fetchChargerStatus } from '@/lib/urban/ev-status';
import { ChargerStatusTable } from '@/app/(public)/urban/charger/[id]/_components/charger-status-table';

// vitest(esbuild) classic 런타임 shim — copy-button-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const units = [
  { chgerId: '01', chgerType: '04', isFast: true },
  { chgerId: '02', chgerType: '02', isFast: false },
];

describe('ChargerStatusTable 첫 렌더 (서버·크롤러가 보는 화면)', () => {
  it('충전기 목록과 "현재 충전 상태 보기" 버튼을 보여주고, 외부 API는 부르지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ChargerStatusTable, { units, statId: 'ME174001' }));
    expect(html).toContain('01번');
    expect(html).toContain('02번');
    expect(html).toContain('DC콤보');
    expect(html).toContain('현재 충전 상태 보기');
    expect(html).not.toContain('미확인');
    expect(fetchChargerStatus).not.toHaveBeenCalled();
  });
});
