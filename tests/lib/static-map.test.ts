import { describe, it, expect } from 'vitest';
import { staticMapPath, staticMapUrl } from '@/lib/seo/static-map';

describe('staticMapPath', () => {
  it('builds a relative proxy path with defaults', () => {
    const path = staticMapPath({ lat: 37.5, lng: 127.1 });
    expect(path).toBe('/api/staticmap?lat=37.5&lng=127.1&w=600&h=400&level=16');
  });

  it('honors overrides', () => {
    const path = staticMapPath({ lat: 37.5, lng: 127.1, w: 800, h: 300, level: 14 });
    expect(path).toBe('/api/staticmap?lat=37.5&lng=127.1&w=800&h=300&level=14');
  });
});

describe('staticMapUrl', () => {
  it('prefixes the site origin for absolute usage (JSON-LD/OG)', () => {
    const url = staticMapUrl({ lat: 37.5, lng: 127.1 });
    expect(url.startsWith('http')).toBe(true);
    expect(url.endsWith('/api/staticmap?lat=37.5&lng=127.1&w=600&h=400&level=16')).toBe(true);
  });
});
