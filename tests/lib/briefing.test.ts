import { describe, it, expect } from 'vitest';
import {
  kstDayStartUtc,
  contractDateWindows,
  areaBandLabel,
  regionLabel,
  buildHashtags,
} from '@/lib/briefing';

describe('kstDayStartUtc', () => {
  it('KST 자정의 UTC 시각(전날 15:00Z)을 반환', () => {
    // 2026-06-05 02:00 KST = 2026-06-04 17:00Z
    const now = new Date('2026-06-04T17:00:00.000Z');
    expect(kstDayStartUtc(now).toISOString()).toBe('2026-06-04T15:00:00.000Z');
  });
});

describe('contractDateWindows', () => {
  it('최근 30일/직전 30일 경계를 KST 날짜로 반환', () => {
    const now = new Date('2026-06-05T00:00:00.000Z'); // 2026-06-05 09:00 KST
    const w = contractDateWindows(now);
    expect(w.recentStart.toISOString().slice(0, 10)).toBe('2026-05-07');
    expect(w.prevStart.toISOString().slice(0, 10)).toBe('2026-04-07');
    expect(w.recentStart > w.prevStart).toBe(true);
    expect(w.prevEnd.toISOString()).toBe(w.recentStart.toISOString());
  });
});

describe('areaBandLabel', () => {
  it('전용면적 구간을 라벨로 매핑', () => {
    expect(areaBandLabel(45)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(59.99)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(84.9)).toBe('전용 60~85㎡');
    expect(areaBandLabel(101)).toBe('전용 85~102㎡');
    expect(areaBandLabel(120)).toBe('전용 102~135㎡');
    expect(areaBandLabel(140)).toBe('전용 135㎡ 초과');
  });
});

describe('regionLabel', () => {
  it('fullName에서 시·도 토큰을 제거해 시군구 라벨 생성', () => {
    expect(regionLabel('경기도 화성시')).toBe('화성시');
    expect(regionLabel('경기도 수원시 영통구')).toBe('수원시 영통구');
    expect(regionLabel('서울특별시 강남구')).toBe('강남구');
    expect(regionLabel('세종특별자치시')).toBe('세종특별자치시'); // 단일 토큰은 그대로
  });
});

describe('buildHashtags', () => {
  it('데이터에서 해시태그 칩 문자열을 생성', () => {
    const tags = buildHashtags({
      txCount: 2431,
      topRegionLabel: '화성시',
      topAreaLabel: '전용 60~85㎡',
      highestRegionLabel: '강남구',
    });
    expect(tags).toEqual([
      '#오늘의실거래',
      '#매매 2,431건',
      '#최고가 강남구',
      '#전용60~85㎡ 최다',
      '#화성시',
    ]);
  });
});
