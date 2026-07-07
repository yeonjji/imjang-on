import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoardColumns } from '@/app/(public)/_components/weekly-board-columns';
import type { WeekModelDay, WeeklyBoardItem } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const item = (id: string): WeeklyBoardItem => ({
  id, name: `공고${id}`, regionShort: '마포구', tone: 'green', badge: 'D-2',
});
const day = (o: Partial<WeekModelDay> & { items: WeeklyBoardItem[] }): WeekModelDay => ({
  weekday: '월', md: '07.06', isToday: false, ...o,
});

describe('WeeklyBoardColumns SSR', () => {
  it('7일 컬럼을 렌더하고 오늘 컬럼에 TODAY 배지를 표시', () => {
    const days: WeekModelDay[] = Array.from({ length: 7 }, (_, i) =>
      day({ md: `07.0${i + 3}`, isToday: i === 3, items: [item('1')] }),
    );
    const html = renderToStaticMarkup(createElement(WeeklyBoardColumns, { days }));
    expect(html).toContain('grid-cols-7');
    expect(html).toContain('TODAY');
  });
  it('컬럼당 상위 N개만 초기 렌더하고 초과분은 더보기 개수로 노출', () => {
    const days: WeekModelDay[] = [day({ items: ['1', '2', '3', '4', '5', '6'].map(item) })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardColumns, { days, perDay: 4 }));
    expect(html).toContain('공고4');
    expect(html).not.toContain('공고5');
    expect(html).toContain('+2건 ↓');
  });
  it('빈 날짜는 일정 없음 안내', () => {
    const days: WeekModelDay[] = [day({ items: [] })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardColumns, { days, perDay: 4 }));
    expect(html).toContain('일정 없음');
  });
});
