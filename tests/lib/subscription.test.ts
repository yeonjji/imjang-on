import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  slugsToCategories,
  deriveStatus,
  ddayLabel,
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
