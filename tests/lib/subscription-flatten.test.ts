import { describe, it, expect } from 'vitest';
import { flattenWeeklyBoard, type WeeklyBoard, type WeeklyBoardItem } from '@/lib/subscription';

function item(p: Partial<WeeklyBoardItem> & { id: string; tone: WeeklyBoardItem['tone'] }): WeeklyBoardItem {
  return { name: `청약${p.id}`, regionShort: null, badge: '', ...p };
}

function board(itemsByDay: WeeklyBoardItem[][]): WeeklyBoard {
  const d = new Date(Date.UTC(2026, 5, 17));
  return {
    weekStart: d,
    weekEnd: d,
    days: itemsByDay.map((items) => ({ date: d, weekday: '수', isToday: false, items, overflow: 0 })),
    summary: { open: 0, upcoming: 0, closed: 0 },
    total: itemsByDay.flat().length,
  };
}

describe('flattenWeeklyBoard', () => {
  it('진행중·예정 우선(orange→green→blue→gray)으로 정렬한다', () => {
    const b = board([
      [item({ id: '1', tone: 'blue' }), item({ id: '2', tone: 'gray' })],
      [item({ id: '3', tone: 'orange' }), item({ id: '4', tone: 'green' })],
    ]);
    expect(flattenWeeklyBoard(b, 10).map((i) => i.id)).toEqual(['3', '4', '1', '2']);
  });

  it('여러 날에 걸친 동일 id는 한 번만 포함한다', () => {
    const b = board([
      [item({ id: '1', tone: 'green' })],
      [item({ id: '1', tone: 'green' }), item({ id: '2', tone: 'green' })],
    ]);
    expect(flattenWeeklyBoard(b, 10).map((i) => i.id)).toEqual(['1', '2']);
  });

  it('limit으로 상위 N개만 반환한다', () => {
    const b = board([
      [item({ id: '1', tone: 'orange' }), item({ id: '2', tone: 'green' }), item({ id: '3', tone: 'blue' })],
    ]);
    expect(flattenWeeklyBoard(b, 2).map((i) => i.id)).toEqual(['1', '2']);
  });
});
