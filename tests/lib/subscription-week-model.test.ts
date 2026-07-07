import { describe, it, expect } from 'vitest';
import { dayBadge, buildWeekModel } from '@/lib/subscription';
import type { WeeklyNoticeRow } from '@/lib/subscription';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const today = D('2026-07-06'); // 주간 07-03 ~ 07-09, 오늘 index 3

const row = (o: Partial<WeeklyNoticeRow> & { id: bigint; name: string }): WeeklyNoticeRow => ({
  regionName: '서울', address: '서울특별시 마포구 합정동',
  receiptBegin: null, receiptEnd: null, ...o,
});

describe('dayBadge (그날 기준)', () => {
  it('시작 전 셀은 예정', () => {
    expect(dayBadge(D('2026-07-08'), D('2026-07-10'), D('2026-07-07'), today))
      .toEqual({ tone: 'blue', badge: '예정' });
  });
  it('시작일 셀은 접수시작', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-03'), today))
      .toEqual({ tone: 'green', badge: '접수시작' });
  });
  it('중간 셀은 그날 기준 D-day (D-2는 초록, D-1은 주황)', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-04'), today))
      .toEqual({ tone: 'green', badge: 'D-2' });
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-05'), today))
      .toEqual({ tone: 'orange', badge: 'D-1' });
  });
  it('마감일이 오늘이면 오늘 마감', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-06'), today))
      .toEqual({ tone: 'orange', badge: '오늘 마감' });
  });
  it('마감일이 미래면 마감일, 과거면 마감', () => {
    expect(dayBadge(null, D('2026-07-08'), D('2026-07-08'), today))
      .toEqual({ tone: 'orange', badge: '마감일' });
    expect(dayBadge(D('2026-07-01'), D('2026-07-04'), D('2026-07-04'), today))
      .toEqual({ tone: 'gray', badge: '마감' });
  });
});

describe('buildWeekModel', () => {
  it('진행중 공고를 활성 구간 매일 셀에 그날 배지로 넣는다 (신제주 시나리오)', () => {
    const m = buildWeekModel(
      [row({ id: 1n, name: '신제주', receiptBegin: D('2026-07-03'), receiptEnd: D('2026-07-06') })],
      today,
    );
    // days[0]=07-03 ... days[3]=07-06(오늘)
    const badgeOn = (i: number) => m.days[i].items.find((x) => x.name === '신제주')?.badge;
    expect(badgeOn(0)).toBe('접수시작'); // 07-03
    expect(badgeOn(1)).toBe('D-2');       // 07-04
    expect(badgeOn(2)).toBe('D-1');       // 07-05
    expect(badgeOn(3)).toBe('오늘 마감');  // 07-06
    expect(m.days[4].items).toHaveLength(0); // 07-07엔 없음
  });

  it('주 시작 전 시작한 진행중 공고는 주 시작~마감일 매일 셀에 그날 배지로 (당산역: 07-01~07-08)', () => {
    const m = buildWeekModel(
      [row({ id: 2n, name: '당산역', receiptBegin: D('2026-07-01'), receiptEnd: D('2026-07-08') })],
      today,
    );
    const badgeOn = (i: number) => m.days[i].items.find((x) => x.name === '당산역')?.badge;
    // days[0]=07-03 ... days[3]=07-06(오늘) ... days[5]=07-08(마감), days[6]=07-09
    expect(badgeOn(0)).toBe('D-5');          // 07-03
    expect(badgeOn(3)).toBe('D-2');          // 07-06(오늘)
    expect(badgeOn(5)).toBe('마감일');        // 07-08 (미래 마감)
    expect(m.days[6].items).toHaveLength(0); // 07-09엔 없음
  });

  it('주 전체를 관통하는 공고는 7일 모두에 나타난다', () => {
    const m = buildWeekModel(
      [row({ id: 3n, name: '롱런', receiptBegin: D('2026-06-20'), receiptEnd: D('2026-07-20') })],
      today,
    );
    expect(m.days.every((d) => d.items.some((x) => x.name === '롱런'))).toBe(true);
  });

  it('오늘 기준 마감된 공고는 활성 구간 전체를 회색 마감으로 표기한다', () => {
    const m = buildWeekModel(
      [row({ id: 4n, name: '지난공고', receiptBegin: D('2026-07-03'), receiptEnd: D('2026-07-04') })],
      today,
    );
    const items = m.days.flatMap((d) => d.items).filter((x) => x.name === '지난공고');
    expect(items).toHaveLength(2); // 07-03, 07-04
    expect(items.every((x) => x.tone === 'gray' && x.badge === '마감')).toBe(true);
    expect(m.summary.closed).toBe(1);
  });

  it('summary와 total, days 문자열 필드를 채운다', () => {
    const m = buildWeekModel([], today);
    expect(m.days).toHaveLength(7);
    expect(m.days[3]).toMatchObject({ isToday: true, md: '07.06', weekday: '월' });
    expect(m.days[0].isToday).toBe(false);
    expect(m.summary).toEqual({ open: 0, upcoming: 0, closed: 0 });
    expect(m.total).toBe(0);
  });
});
