import { describe, it, expect } from 'vitest';
import { normalizeSiteUrl } from '@/lib/site';

describe('normalizeSiteUrl', () => {
  it('끝 개행을 제거한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr\n')).toBe('https://imjangon.co.kr');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeSiteUrl('  https://imjangon.co.kr  ')).toBe('https://imjangon.co.kr');
  });

  it('끝 슬래시를 제거한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr/')).toBe('https://imjangon.co.kr');
    expect(normalizeSiteUrl('https://imjangon.co.kr///')).toBe('https://imjangon.co.kr');
  });

  it('정상 값은 그대로 유지한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr')).toBe('https://imjangon.co.kr');
  });
});
