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
  });
  it('숫자로 끝나면 읽는 소리 기준(0영·1일·3삼·6육·7칠·8팔 받침)', () => {
    expect(hasFinalConsonant('타워123')).toBe(true); // 삼
    expect(hasFinalConsonant('101')).toBe(true);
    expect(hasFinalConsonant('2')).toBe(false);
    expect(josa('센트럴101', '은', '는')).toBe('센트럴101은');
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
  it("'으로'는 ㄹ 받침 뒤에서 '로'", () => {
    expect(josa('서울', '으로', '로')).toBe('서울로');
    expect(josa('타입 1', '으로', '로')).toBe('타입 1로');
    expect(josa('타입 3', '으로', '로')).toBe('타입 3으로');
    expect(josa('인건비', '으로', '로')).toBe('인건비로');
    expect(josa('84.97㎡ A', '으로', '로')).toBe('84.97㎡ A로');
  });
});
