import { describe, it, expect } from 'vitest';
import { sidoPrefix, sidoFromPrefix } from '@/lib/region';

describe('sidoPrefix', () => {
  it('짧은 시도명', () => {
    expect(sidoPrefix('서울')).toBe('11');
    expect(sidoPrefix('경기')).toBe('41');
    expect(sidoPrefix('제주')).toBe('50');
  });

  it('풀 시도명 (행정 접미사 포함)', () => {
    expect(sidoPrefix('서울특별시')).toBe('11');
    expect(sidoPrefix('경기도')).toBe('41');
    expect(sidoPrefix('세종특별자치시')).toBe('36');
    expect(sidoPrefix('제주특별자치도')).toBe('50');
    expect(sidoPrefix('부산광역시')).toBe('26');
  });

  it('미존재 시도명', () => {
    expect(sidoPrefix('존재하지않음')).toBeUndefined();
    expect(sidoPrefix('')).toBeUndefined();
  });
});

describe('sidoFromPrefix', () => {
  it('정상 prefix', () => {
    expect(sidoFromPrefix('11')).toBe('서울');
    expect(sidoFromPrefix('41')).toBe('경기');
    expect(sidoFromPrefix('50')).toBe('제주');
  });

  it('미존재 prefix', () => {
    expect(sidoFromPrefix('99')).toBeUndefined();
    expect(sidoFromPrefix('')).toBeUndefined();
  });
});
