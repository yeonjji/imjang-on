import { describe, it, expect } from 'vitest';
import { mapImagePath, mapImageUrl } from '@/lib/seo/static-map';

describe('mapImagePath', () => {
  it('builds a relative entity map route path', () => {
    const path = mapImagePath('property', '123');
    expect(path).toBe('/map/property/123');
  });

  it('accepts bigint ids', () => {
    const path = mapImagePath('school', 456n);
    expect(path).toBe('/map/school/456');
  });
});

describe('mapImageUrl', () => {
  it('prefixes the site origin for absolute usage (JSON-LD/OG)', () => {
    const url = mapImageUrl('property', '123');
    expect(url.startsWith('http')).toBe(true);
    expect(url.endsWith('/map/property/123')).toBe(true);
  });
});
