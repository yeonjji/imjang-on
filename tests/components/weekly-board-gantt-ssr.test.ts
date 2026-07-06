import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoardGantt } from '@/app/(public)/_components/weekly-board-gantt';
import type { WeekModelDay, WeekBar } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const days: WeekModelDay[] = Array.from({ length: 7 }, (_, i) => ({
  weekday: '월화수목금토일'[i], md: `07.0${i + 3}`, isToday: i === 3, items: [],
}));
const bar = (o: Partial<WeekBar> & { id: string; name: string }): WeekBar => ({
  regionShort: null, startIdx: 0, endIdx: 3, startsBeforeWeek: false, endsAfterWeek: false,
  tone: 'green', todayDdayLabel: 'D-2', ...o,
});

describe('WeeklyBoardGantt SSR', () => {
  it('상위 N행만 초기 렌더하고 나머지는 더보기 버튼 개수로 노출', () => {
    const bars = Array.from({ length: 8 }, (_, i) => bar({ id: String(i), name: `공고${i}` }));
    const html = renderToStaticMarkup(createElement(WeeklyBoardGantt, { days, bars, initialVisible: 6 }));
    expect(html).toContain('공고0');
    expect(html).toContain('공고5');
    expect(html).not.toContain('공고6'); // 접힘 상태
    expect(html).toContain('+2건 더보기');
  });
  it('막대에 공고명과 오늘 기준 마감칩을 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBoardGantt, { days, bars: [bar({ id: '1', name: '신제주' })] }),
    );
    expect(html).toContain('신제주');
    expect(html).toContain('D-2');
  });
});
