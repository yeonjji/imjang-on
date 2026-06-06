import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  slugsToCategories,
  deriveStatus,
  ddayLabel,
  formatPriceRange,
  formatAreaRange,
  getWeekRange,
  boardTone,
  parseSigungu,
  assembleWeeklyBoard,
} from '@/lib/subscription';
import type { WeeklyNoticeRow } from '@/lib/subscription';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('categoryLabel / slugsToCategories', () => {
  it('6종 카테고리 라벨을 반환한다', () => {
    expect(categoryLabel('APT')).toBe('아파트');
    expect(categoryLabel('OFFICETEL_ETC')).toBe('오피스텔·도시형');
    expect(categoryLabel('REMNANT')).toBe('무순위·잔여');
    expect(categoryLabel('PUB_PRIV_RENT')).toBe('공공·민간임대');
    expect(categoryLabel('ARBITRARY')).toBe('임의공급');
    expect(categoryLabel('LH_PRESUB')).toBe('LH 사전청약');
  });
  it('슬러그 CSV를 카테고리로 변환하고 미지정은 버린다', () => {
    expect(slugsToCategories(['apt', 'opt', 'nope'])).toEqual(['APT', 'ARBITRARY']);
  });
});

describe('deriveStatus', () => {
  const today = D('2026-06-05');
  it('접수 시작 전이면 예정 + 시작까지 D-day', () => {
    expect(deriveStatus(D('2026-06-08'), D('2026-06-09'), today)).toEqual({
      status: 'UPCOMING',
      dday: 3,
    });
  });
  it('접수 구간 내면 접수중 + 마감까지 D-day', () => {
    expect(deriveStatus(D('2026-06-01'), D('2026-06-09'), today)).toEqual({
      status: 'OPEN',
      dday: 4,
    });
  });
  it('마감일이 과거면 마감', () => {
    expect(deriveStatus(D('2026-05-01'), D('2026-05-09'), today)).toEqual({
      status: 'CLOSED',
      dday: null,
    });
  });
  it('시작일 없이 마감일이 미래면 접수중', () => {
    expect(deriveStatus(null, D('2026-06-09'), today).status).toBe('OPEN');
  });
  it('날짜가 모두 없으면 마감(보수적)', () => {
    expect(deriveStatus(null, null, today)).toEqual({ status: 'CLOSED', dday: null });
  });
  it('마감일이 오늘이면 접수중 D-0', () => {
    expect(deriveStatus(D('2026-06-01'), D('2026-06-05'), today)).toEqual({
      status: 'OPEN',
      dday: 0,
    });
  });
  it('시작일이 미래면 마감일이 없어도 예정', () => {
    expect(deriveStatus(D('2026-07-01'), null, today).status).toBe('UPCOMING');
  });
  it('시작일은 과거인데 마감일이 없으면 마감(보수적)', () => {
    expect(deriveStatus(D('2026-05-01'), null, today)).toEqual({ status: 'CLOSED', dday: null });
  });
});

describe('ddayLabel', () => {
  it('접수중 D-day 라벨', () => {
    expect(ddayLabel({ status: 'OPEN', dday: 4 })).toBe('D-4');
    expect(ddayLabel({ status: 'OPEN', dday: 0 })).toBe('오늘 마감');
  });
  it('예정 라벨', () => {
    expect(ddayLabel({ status: 'UPCOMING', dday: 3 })).toBe('3일 후');
    expect(ddayLabel({ status: 'UPCOMING', dday: 0 })).toBe('오늘 시작');
  });
  it('마감은 라벨 없음', () => {
    expect(ddayLabel({ status: 'CLOSED', dday: null })).toBeNull();
  });
});

describe('formatPriceRange (만원 단위 topAmount)', () => {
  it('동일 값이면 단일 표기', () => {
    expect(formatPriceRange(50000, 50000)).toBe('5억');
  });
  it('범위면 최소~최대', () => {
    expect(formatPriceRange(50000, 90000)).toBe('5억~9억');
  });
  it('null이 섞이면 -', () => {
    expect(formatPriceRange(null, 90000)).toBe('-');
    expect(formatPriceRange(null, null)).toBe('-');
  });
});

describe('formatAreaRange (㎡ → 평)', () => {
  it('동일 값이면 단일 표기', () => {
    expect(formatAreaRange(84.5, 84.5)).toBe('26평');
  });
  it('범위면 최소~최대', () => {
    expect(formatAreaRange(59, 114)).toBe('18평~34평');
  });
  it('null이 섞이면 -', () => {
    expect(formatAreaRange(null, 84)).toBe('-');
  });
});

describe('getWeekRange (월~일 UTC)', () => {
  it('주중(금요일) 기준 월요일~일요일 7일을 만든다', () => {
    const r = getWeekRange(D('2026-06-05'));
    expect(r.weekStart).toEqual(D('2026-06-01'));
    expect(r.weekEnd).toEqual(D('2026-06-07'));
    expect(r.dates).toHaveLength(7);
    expect(r.dates[0]).toEqual(D('2026-06-01'));
    expect(r.dates[6]).toEqual(D('2026-06-07'));
  });
  it('일요일은 같은 주의 끝으로 본다', () => {
    const r = getWeekRange(D('2026-06-07'));
    expect(r.weekStart).toEqual(D('2026-06-01'));
    expect(r.weekEnd).toEqual(D('2026-06-07'));
  });
  it('월요일은 주의 시작이다', () => {
    const r = getWeekRange(D('2026-06-01'));
    expect(r.weekStart).toEqual(D('2026-06-01'));
  });
});

describe('boardTone', () => {
  it('예정은 파랑 + 예정', () => {
    expect(boardTone({ status: 'UPCOMING', dday: 3 })).toEqual({ tone: 'blue', badge: '예정' });
  });
  it('접수중 D-day 2 이상은 초록 + 진행중', () => {
    expect(boardTone({ status: 'OPEN', dday: 4 })).toEqual({ tone: 'green', badge: '진행중' });
  });
  it('접수중 D-1은 주황 + D-1', () => {
    expect(boardTone({ status: 'OPEN', dday: 1 })).toEqual({ tone: 'orange', badge: 'D-1' });
  });
  it('접수중 오늘 마감은 주황 + 오늘 마감', () => {
    expect(boardTone({ status: 'OPEN', dday: 0 })).toEqual({ tone: 'orange', badge: '오늘 마감' });
  });
  it('마감은 회색 + 마감', () => {
    expect(boardTone({ status: 'CLOSED', dday: null })).toEqual({ tone: 'gray', badge: '마감' });
  });
});

describe('parseSigungu', () => {
  it('구가 있으면 구를 반환한다', () => {
    expect(parseSigungu('서울특별시 마포구 합정동 1-2', '서울')).toBe('마포구');
  });
  it('군이 있으면 군을 반환한다', () => {
    expect(parseSigungu('경기도 양평군 양평읍', '경기')).toBe('양평군');
  });
  it('구·군이 없으면 시를 반환한다', () => {
    expect(parseSigungu('경기도 부천시 원미구 ', '경기')).toBe('원미구');
    expect(parseSigungu('경기도 부천시', '경기')).toBe('부천시');
  });
  it('주소가 없으면 regionName 폴백', () => {
    expect(parseSigungu(null, '서울')).toBe('서울');
  });
  it('둘 다 없으면 null', () => {
    expect(parseSigungu(null, null)).toBeNull();
  });
  it('특별자치시·광역시는 접미사를 떼고 축약한다', () => {
    expect(parseSigungu('세종특별자치시 보람동', '세종')).toBe('세종');
    expect(parseSigungu('부산광역시 해운대구 우동', '부산')).toBe('해운대구'); // 구 우선
    expect(parseSigungu('부산광역시 강서동', '부산')).toBe('부산');
  });
});

const row = (o: Partial<WeeklyNoticeRow> & { id: bigint; name: string }): WeeklyNoticeRow => ({
  regionName: '서울', address: '서울특별시 마포구 합정동',
  receiptBegin: null, receiptEnd: null, ...o,
});

describe('assembleWeeklyBoard', () => {
  const today = D('2026-06-06');

  it('항상 7일(월~일)을 만들고 오늘을 표시한다', () => {
    const b = assembleWeeklyBoard([], today);
    expect(b.days).toHaveLength(7);
    expect(b.days[0].weekday).toBe('월');
    expect(b.days[6].weekday).toBe('일');
    expect(b.days.find((d) => d.isToday)?.date).toEqual(D('2026-06-06'));
    expect(b.total).toBe(0);
    expect(b.summary).toEqual({ open: 0, upcoming: 0, closed: 0 });
  });

  it('예정은 접수 시작일에, 마감/진행은 마감일에 배치한다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: '부천 센트럴포레', receiptBegin: D('2026-06-08'), receiptEnd: D('2026-06-10') }),
      row({ id: 2n, name: '강동 리버파크', receiptBegin: D('2026-05-20'), receiptEnd: D('2026-06-02') }),
      row({ id: 3n, name: '마포 더하이츠', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }),
    ], today);
    const tue = b.days.find((d) => d.weekday === '화')!;
    expect(tue.items.map((i) => i.name)).toContain('강동 리버파크');
    expect(tue.items[0].badge).toBe('마감');
  });

  it('상태별 summary를 집계한다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: 'A', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }),
      row({ id: 2n, name: 'B', receiptBegin: D('2026-06-08'), receiptEnd: D('2026-06-10') }),
      row({ id: 3n, name: 'C', receiptBegin: D('2026-05-20'), receiptEnd: D('2026-06-02') }),
    ], today);
    expect(b.summary).toEqual({ open: 1, upcoming: 1, closed: 1 });
    expect(b.total).toBe(3);
  });

  it('하루 4건이면 3건 + overflow 1', () => {
    const sameDay = { receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-04') };
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: 'A', ...sameDay }), row({ id: 2n, name: 'B', ...sameDay }),
      row({ id: 3n, name: 'C', ...sameDay }), row({ id: 4n, name: 'D', ...sameDay }),
    ], today);
    const thu = b.days.find((d) => d.weekday === '목')!;
    expect(thu.items).toHaveLength(3);
    expect(thu.overflow).toBe(1);
  });

  it('아이템에 링크용 id와 지역 축약을 담는다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 7n, name: '마포 더하이츠', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }),
    ], today);
    const item = b.days.flatMap((d) => d.items).find((i) => i.name === '마포 더하이츠')!;
    expect(item.id).toBe('7');
    expect(item.regionShort).toBe('마포구');
  });
});
