import { describe, it, expect } from 'vitest';
import { toTags, emptyToNull } from '@/scripts/ingest/loan/normalize';

describe('toTags', () => {
  it('콤마 다값을 트림해 태그 배열로 만든다', () => {
    expect(toTags('근로자, 사업자, 연금소득자')).toEqual(['근로자', '사업자', '연금소득자']);
  });
  it('접미사 "등"을 제거한다', () => {
    expect(toTags('금융취약계층 등')).toEqual(['금융취약계층']);
  });
  it('"등" 제거 후 생긴 중복을 제거한다', () => {
    expect(toTags('금융취약계층, 금융취약계층 등')).toEqual(['금융취약계층']);
  });
  it('"-"·빈값·null 은 빈 배열', () => {
    expect(toTags('-')).toEqual([]);
    expect(toTags('')).toEqual([]);
    expect(toTags(null)).toEqual([]);
    expect(toTags(undefined)).toEqual([]);
  });
  it('단일 값(콤마 없음)도 1개 태그', () => {
    expect(toTags('운영·시설')).toEqual(['운영·시설']);
  });
});

describe('emptyToNull', () => {
  it('빈값·"-"·null 은 null, 그 외는 문자열', () => {
    expect(emptyToNull('-')).toBeNull();
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull('변동금리')).toBe('변동금리');
    expect(emptyToNull(2000)).toBe('2000');
  });
});
