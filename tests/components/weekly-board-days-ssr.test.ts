import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoardDays } from '@/app/(public)/_components/weekly-board-days';
import type { WeekModelDay, WeeklyBoardItem } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const item = (id: string): WeeklyBoardItem => ({
  id, name: `공고${id}`, regionShort: '마포구', tone: 'green', badge: 'D-2',
});
const day = (o: Partial<WeekModelDay> & { items: WeeklyBoardItem[] }): WeekModelDay => ({
  weekday: '월', md: '07.06', isToday: true, ...o,
});

describe('WeeklyBoardDays SSR', () => {
  it('날짜별 상위 N개만 초기 렌더하고 초과분은 더보기 개수로 노출', () => {
    const days: WeekModelDay[] = [day({ items: ['1', '2', '3', '4', '5'].map(item) })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardDays, { days, perDay: 3 }));
    expect(html).toContain('공고1');
    expect(html).toContain('공고3');
    expect(html).not.toContain('공고4');
    expect(html).toContain('+2건 더보기');
  });
  it('빈 날짜는 일정 없음 안내', () => {
    const days: WeekModelDay[] = [day({ items: [] })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardDays, { days, perDay: 3 }));
    expect(html).toContain('청약 일정 없음');
  });
});
