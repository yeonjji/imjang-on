import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

vi.mock('@/lib/env', () => ({
  // geocoder.ts가 함께 import하는 lib/logger.ts가 env.LOG_LEVEL로 pino를 초기화하므로 같이 채운다.
  env: { KAKAO_REST_KEY: 'test-kakao-key', LOG_LEVEL: 'silent' },
}));

import { geocodeKeyword } from '@/scripts/ingest/geocoder';

function keywordResponse(doc: {
  x: string;
  y: string;
  address_name?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
}) {
  return new Response(JSON.stringify({ documents: [doc] }), { status: 200 });
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('geocodeKeyword', () => {
  // 카카오 키워드검색 실응답에는 region_1depth_name/region_2depth_name이 없다.
  // address_name을 위치(split)로 쪼개면 일반구(수원시 영통구)의 구가 잘려 나가
  // 틀린 좌표가 regionMatches 검증을 통과해 버린다 — parseAddressRegion으로 파싱해야 한다.
  it('일반구 주소의 구를 잃지 않고 파싱한다', async () => {
    fetchSpy.mockResolvedValue(
      keywordResponse({ x: '127.0286', y: '37.2914', address_name: '경기 수원시 팔달구 인계동 123-4' }),
    );
    const coord = await geocodeKeyword('수원 팔달구 인계동 123-4');
    expect(coord?.region1).toBe('경기');
    expect(coord?.region2).toBe('수원시 팔달구');
  });

  it('일반구가 있는 시는 시+구까지 채운다', async () => {
    // TODO: 이름이 원래 주장한 "구가 없는 시(군)는 시 단위까지만" 케이스는 아직 없다 —
    // 이 테스트는 청주시 흥덕구(일반구 있음)라 region2가 '청주시 흥덕구'까지 채워진다.
    // 진짜 "구 없는 시" 분기(예: 강릉시 단독)는 아직 커버되지 않았다.
    fetchSpy.mockResolvedValue(
      keywordResponse({ x: '127.4200', y: '36.4800', address_name: '충북 청주시 흥덕구 봉명동 100' }),
    );
    const coord = await geocodeKeyword('청주 흥덕구 봉명동 100');
    expect(coord?.region1).toBe('충북');
    expect(coord?.region2).toBe('청주시 흥덕구');
  });

  it('region_*depth_name이 응답에 실려 있으면 그쪽을 우선한다', async () => {
    fetchSpy.mockResolvedValue(
      keywordResponse({
        x: '127.0',
        y: '37.5',
        address_name: '서울 강남구 역삼동 1',
        region_1depth_name: '서울특별시',
        region_2depth_name: '강남구',
      }),
    );
    const coord = await geocodeKeyword('강남 역삼동 1');
    expect(coord?.region1).toBe('서울특별시');
    expect(coord?.region2).toBe('강남구');
  });

  it('결과가 없으면 null', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ documents: [] }), { status: 200 }));
    const coord = await geocodeKeyword('존재하지-않는-질의');
    expect(coord).toBeNull();
  });
});
