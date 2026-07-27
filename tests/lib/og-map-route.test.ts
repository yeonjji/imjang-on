import { describe, it, expect } from 'vitest';
import { createOgMapRoute, type OgMapData } from '@/lib/seo/og-map-route';

describe('createOgMapRoute', () => {
  it('load가 null이면 generateImageMetadata는 빈 배열을 반환한다', async () => {
    const route = createOgMapRoute(async () => null);
    const result = await route.generateImageMetadata({ params: Promise.resolve({}) });
    expect(result).toEqual([]);
  });

  it('load가 null이면 Image는 404 + no-store를 반환한다', async () => {
    const route = createOgMapRoute(async () => null);
    const res = await route.Image({ params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('load가 데이터를 주면 metadata 항목에 중첩된 size를 담는다', async () => {
    const data: OgMapData = {
      title: '테스트 단지',
      subtitle: '테스트 지역 · 임장ON',
      alt: '테스트 위치 지도',
      lat: 37.5,
      lng: 127.0,
      level: 16,
      marker: true,
    };
    const route = createOgMapRoute(async () => data);
    const result = await route.generateImageMetadata({ params: Promise.resolve({}) });
    expect(result).toHaveLength(1);
    const [item] = result;
    // 플랫 스프레드로 되돌아가는 회귀를 막는다 — Next는 중첩된 size만 읽는다.
    expect(item.size).toEqual({ width: 1200, height: 630 });
    expect(item.contentType).toBe('image/png');
    expect(item.alt).toBe(data.alt);
  });
});
