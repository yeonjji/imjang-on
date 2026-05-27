import { describe, it, expect } from 'vitest';
import { storeIndustryToCategory } from '@/lib/amenity-category';

describe('storeIndustryToCategory', () => {
  it('편의점·슈퍼·대형마트·카페는 mart', () => {
    for (const c of ['G20405', 'G20404', 'G20402', 'I21201']) {
      expect(storeIndustryToCategory(c)).toBe('mart');
    }
  });
  it('약국·병원·의원은 medical', () => {
    for (const c of ['G21501', 'Q101', 'Q102']) {
      expect(storeIndustryToCategory(c)).toBe('medical');
    }
  });
  it('소분류 코드 접두로도 매칭한다(상세 코드 변형 대비)', () => {
    expect(storeIndustryToCategory('Q10103')).toBe('medical');
  });
  it('미지정/모르는 코드는 null', () => {
    expect(storeIndustryToCategory(null)).toBeNull();
    expect(storeIndustryToCategory('Z999')).toBeNull();
  });
});
