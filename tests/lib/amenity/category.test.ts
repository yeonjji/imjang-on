import { describe, it, expect } from 'vitest';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';

describe('getCategoryDef', () => {
  it('4종 슬러그 모두 정의 반환', () => {
    for (const slug of AMENITY_SLUGS) {
      const def = getCategoryDef(slug);
      expect(def).toBeTruthy();
      expect(def?.slug).toBe(slug);
      expect(def?.label).toBeTruthy();
    }
  });
  it('잘못된 슬러그는 null', () => {
    expect(getCategoryDef('hospital')).toBeNull();
    expect(getCategoryDef('')).toBeNull();
  });
  it('AMENITY_SLUGS는 4종', () => {
    expect(AMENITY_SLUGS).toEqual(['convenience', 'mart', 'cafe', 'market']);
  });
  it('mart, market만 subFilters 보유', () => {
    expect(getCategoryDef('convenience')?.subFilters).toBeUndefined();
    expect(getCategoryDef('cafe')?.subFilters).toBeUndefined();
    expect(getCategoryDef('mart')?.subFilters).toBeTruthy();
    expect(getCategoryDef('market')?.subFilters).toBeTruthy();
  });
});
