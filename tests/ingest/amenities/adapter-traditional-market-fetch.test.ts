import { describe, it, expect, vi } from 'vitest';

// 표준데이터 API는 type 파라미터가 없으면 JSON을 돌려준다. 파서는 XML 전용이라
// type 누락 시 매 페이지 0건으로 조용히 끝난다(2026-10-01 로컬 실수집에서 발견).
const calls: Record<string, string | number>[] = [];

vi.mock('@/lib/env', () => ({ env: { PUBLIC_DATA_KEY: 'test-key' } }));
vi.mock('@/scripts/ingest/amenities/geocode-fill', () => ({
  enrichWithGeocode: async <T>(rows: T[]) => rows,
}));
vi.mock('@/scripts/ingest/amenities/http', () => ({
  fetchAmenityPage: async (_url: string, params: Record<string, string | number>) => {
    calls.push(params);
    return '<response><body><items></items><totalCount>0</totalCount></body></response>';
  },
  fetchAllPages: async (fn: (pageNo: number) => Promise<unknown>) => {
    await fn(1);
  },
}));

describe('fetchAllTraditionalMarkets', () => {
  it('XML 응답을 요청한다(type=xml)', async () => {
    const { fetchAllTraditionalMarkets } = await import('@/scripts/ingest/amenities/adapter-traditional-market');
    await fetchAllTraditionalMarkets();
    expect(calls[0]).toMatchObject({ type: 'xml' });
  });
});
