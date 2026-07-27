import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: 'test-key-id',
    NAVER_MAP_CLIENT_SECRET: 'test-secret',
  },
}));

import { fetchStaticMapPng } from '@/lib/seo/static-map-fetch';

function okResponse() {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('fetchStaticMapPng', () => {
  it('NCP는 center를 lng,lat 순서로 기대한다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.4979, lng: 127.0276, w: 600, h: 400, level: 16, marker: true });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('center')).toBe('127.0276,37.4979');
    expect(url.searchParams.get('w')).toBe('600');
    expect(url.searchParams.get('h')).toBe('400');
    expect(url.searchParams.get('level')).toBe('16');
  });

  it('marker=true면 마커 파라미터를 붙인다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('markers')).toBe('type:d|size:mid|pos:127 37.5');
  });

  it('marker=false면 마커 파라미터가 없다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 1024, h: 538, level: 13, marker: false });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('markers')).toBeNull();
  });

  it('인증 헤더를 싣는다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-ncp-apigw-api-key-id']).toBe('test-key-id');
    expect((init.headers as Record<string, string>)['x-ncp-apigw-api-key']).toBe('test-secret');
  });

  it('상류 호출을 30일 캐시하고 타임아웃 signal을 싣는다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true });

    const init = fetchSpy.mock.calls[0][1] as RequestInit & { next?: { revalidate?: number } };
    expect(init.next?.revalidate).toBe(2_592_000);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('상류가 4xx/5xx면 던진다', async () => {
    fetchSpy.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(
      fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true }),
    ).rejects.toThrow('ncp static map 500');
  });
});
