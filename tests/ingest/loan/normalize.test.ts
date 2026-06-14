import { describe, it, expect } from 'vitest';
import {
  toTags,
  emptyToNull,
  sanitizeYearTermValue,
  sanitizeRawItem,
} from '@/scripts/ingest/loan/normalize';

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

describe('sanitizeYearTermValue', () => {
  it('50년 초과 토큰만 제거하고 정상값은 유지', () => {
    expect(sanitizeYearTermValue('10, 15, 20, 309, 14, 19, 29')).toBe('10, 15, 20, 14, 19, 29');
    expect(sanitizeYearTermValue('5')).toBe('5');
    expect(sanitizeYearTermValue('5~30')).toBe('5~30');
  });
  it('단위·설명이 든 텍스트는 보존(정답을 알 수 없음)', () => {
    expect(sanitizeYearTermValue('5(최대 60개월, 보증기간 이내)')).toBe('5(최대 60개월, 보증기간 이내)');
    expect(sanitizeYearTermValue('은행별 상이')).toBe('은행별 상이');
  });
  it('null·빈값은 그대로', () => {
    expect(sanitizeYearTermValue(null)).toBeNull();
  });
});

describe('sanitizeRawItem', () => {
  it('연단위 기간 필드만 교정하고 나머지는 그대로 둔다', () => {
    const out = sanitizeRawItem({
      maxrdpttrm: '10, 15, 20, 309, 14, 19, 29',
      maxtotlntrm: '5',
      finprdnm: '신혼부부전용 구입자금',
    });
    expect(out.maxrdpttrm).toBe('10, 15, 20, 14, 19, 29');
    expect(out.maxtotlntrm).toBe('5');
    expect(out.finprdnm).toBe('신혼부부전용 구입자금');
  });
});
