import { describe, it, expect } from 'vitest';
import { createOgMapRoute, OG_MAP_MAX_INFLIGHT, type OgMapData } from '@/lib/seo/og-map-route';

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

  it('동시 렌더가 한도에 차면 load도 하지 않고 즉시 503 + no-store로 돌려보낸다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let loads = 0;
    const route = createOgMapRoute(async () => {
      loads++;
      await gate;
      return null;
    });

    const inflight = Array.from({ length: OG_MAP_MAX_INFLIGHT }, () =>
      route.Image({ params: Promise.resolve({}) }),
    );
    const shed = await route.Image({ params: Promise.resolve({}) });
    expect(shed.status).toBe(503);
    expect(shed.headers.get('Cache-Control')).toBe('no-store');
    expect(shed.headers.get('Retry-After')).not.toBeNull();
    expect(loads).toBe(OG_MAP_MAX_INFLIGHT);

    release();
    await Promise.all(inflight);
    // 슬롯이 반납되어야 다음 요청이 다시 렌더된다.
    const next = await route.Image({ params: Promise.resolve({}) });
    expect(next.status).toBe(404);
  });

  it('load가 throw해도 슬롯을 반납한다', async () => {
    const failing = createOgMapRoute(async () => {
      throw new Error('db down');
    });
    for (let i = 0; i < OG_MAP_MAX_INFLIGHT; i++) {
      await expect(failing.Image({ params: Promise.resolve({}) })).rejects.toThrow('db down');
    }
    const ok = createOgMapRoute(async () => null);
    const res = await ok.Image({ params: Promise.resolve({}) });
    expect(res.status).toBe(404);
  });
});
