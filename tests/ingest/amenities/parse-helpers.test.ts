import { describe, it, expect } from 'vitest';
import {
  strOrNull,
  boolFromYn,
  parseRefDate,
  intInRange,
  clip,
} from '@/scripts/ingest/amenities/parse-helpers';

describe('parse-helpers', () => {
  it('strOrNull: 빈 값과 공백은 null, 나머지는 trim', () => {
    expect(strOrNull(undefined)).toBeNull();
    expect(strOrNull(null)).toBeNull();
    expect(strOrNull('')).toBeNull();
    expect(strOrNull('   ')).toBeNull();
    expect(strOrNull(' 매일 ')).toBe('매일');
    expect(strOrNull(62)).toBe('62');
  });

  it('boolFromYn: Y/N만 인정', () => {
    expect(boolFromYn('Y')).toBe(true);
    expect(boolFromYn('N')).toBe(false);
    expect(boolFromYn('')).toBeNull();
    expect(boolFromYn('y')).toBeNull();
    expect(boolFromYn(undefined)).toBeNull();
  });

  it('parseRefDate: YYYY-MM-DD만 UTC 자정으로', () => {
    expect(parseRefDate('2025-11-10')?.toISOString()).toBe('2025-11-10T00:00:00.000Z');
    expect(parseRefDate('20251110')).toBeNull();
    expect(parseRefDate('')).toBeNull();
    expect(parseRefDate(undefined)).toBeNull();
  });

  it('intInRange: 정수이고 범위 안일 때만', () => {
    expect(intInRange(1955, 1700, 2026)).toBe(1955);
    expect(intInRange('62', 1, 100000)).toBe(62);
    expect(intInRange('0', 1, 100000)).toBeNull();
    expect(intInRange(1650, 1700, 2026)).toBeNull();
    expect(intInRange(2099, 1700, 2026)).toBeNull();
    expect(intInRange('12.5', 1, 100)).toBeNull();
    expect(intInRange('abc', 1, 100)).toBeNull();
    expect(intInRange('', 1, 100)).toBeNull();
  });

  it('clip: 길이 초과분을 자른다', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip('ab', 3)).toBe('ab');
    expect(clip(null, 3)).toBeNull();
  });
});
