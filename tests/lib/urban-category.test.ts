import { describe, it, expect } from 'vitest';
import { URBAN_SLUGS, getUrbanCategoryDef } from '@/lib/urban/category';

describe('urban category registry', () => {
  it('exposes parking, charger, and park as live slugs', () => {
    expect(URBAN_SLUGS).toEqual(['parking', 'charger', 'park']);
  });

  it('returns parkingDef for "parking"', () => {
    const def = getUrbanCategoryDef('parking');
    expect(def).not.toBeNull();
    expect(def?.slug).toBe('parking');
    expect(def?.label).toBe('주차장');
    expect(def?.emoji).toBe('🅿️');
  });

  it('returns null for unknown slug', () => {
    expect(getUrbanCategoryDef('foo')).toBeNull();
  });

  it('returns parkDef for "park"', () => {
    const def = getUrbanCategoryDef('park');
    expect(def).not.toBeNull();
    expect(def?.slug).toBe('park');
  });
});
