import { describe, it, expect } from 'vitest';
import { hasFinalConsonant, josa } from '@/lib/seo/josa';

describe('hasFinalConsonant', () => {
  it('detects 받침', () => {
    expect(hasFinalConsonant('서울')).toBe(true);   // ㄹ
    expect(hasFinalConsonant('부평')).toBe(true);    // ㅇ
  });
  it('detects no 받침', () => {
    expect(hasFinalConsonant('메가')).toBe(false);   // 가
    expect(hasFinalConsonant('도리')).toBe(false);   // 리
  });
  it('non-hangul ending → false (default)', () => {
    expect(hasFinalConsonant('APT')).toBe(false);
    expect(hasFinalConsonant('타워123')).toBe(false);
  });
  it('empty → false', () => {
    expect(hasFinalConsonant('')).toBe(false);
  });
});

describe('josa', () => {
  it('은/는', () => {
    expect(josa('서울', '은', '는')).toBe('서울은');
    expect(josa('메가', '은', '는')).toBe('메가는');
  });
  it('이/가', () => {
    expect(josa('부평', '이', '가')).toBe('부평이');
    expect(josa('도리', '이', '가')).toBe('도리가');
  });
});
