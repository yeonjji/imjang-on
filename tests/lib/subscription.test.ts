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
} from '@/lib/subscription';

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
});
