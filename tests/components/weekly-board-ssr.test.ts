import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoard } from '@/app/(public)/_components/weekly-board';
import type { WeekModelDay, WeeklyBoardItem } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const item = (id: string): WeeklyBoardItem => ({
  id, name: `공고${id}`, regionShort: '마포구', tone: 'green', badge: 'D-2',
});
const day = (o: Partial<WeekModelDay> & { items: WeeklyBoardItem[] }): WeekModelDay => ({
  weekday: '월', md: '07.06', isToday: false, ...o,
});

describe('WeeklyBoard SSR', () => {
  it('반응형 7열 그리드를 렌더하고 오늘 셀에 TODAY 배지를 표시', () => {
    const days: WeekModelDay[] = Array.from({ length: 7 }, (_, i) =>
      day({ md: `07.0${i + 3}`, isToday: i === 3, items: [item('1')] }),
    );
    const html = renderToStaticMarkup(createElement(WeeklyBoard, { days }));
    expect(html).toContain('md:grid-cols-7');
    expect(html).toContain('TODAY');
  });

  it('셀당 상위 N개만 초기 렌더하고 초과분은 더보기 개수로 노출', () => {
    const days: WeekModelDay[] = [day({ items: ['1', '2', '3', '4', '5', '6'].map(item) })];
    const html = renderToStaticMarkup(createElement(WeeklyBoard, { days, perDay: 4 }));
    expect(html).toContain('공고4');
    expect(html).not.toContain('공고5');
    expect(html).toContain('+2건 더보기 ↓');
  });

  it('빈 날짜는 청약 일정 없음 안내', () => {
    const days: WeekModelDay[] = [day({ items: [] })];
    const html = renderToStaticMarkup(createElement(WeeklyBoard, { days, perDay: 4 }));
    expect(html).toContain('청약 일정 없음');
  });

  // PC/모바일 이중 렌더 회귀 가드: 각 공고는 HTML에 딱 한 번만 존재해야 한다.
  it('공고 콘텐츠를 중복 없이 한 번만 렌더', () => {
    const days: WeekModelDay[] = [day({ items: [item('1')] })];
    const html = renderToStaticMarkup(createElement(WeeklyBoard, { days }));
    expect(html.match(/공고1/g)).toHaveLength(1);
  });
});
