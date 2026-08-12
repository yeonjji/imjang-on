import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  // geocode-enrich.ts가 직접 import하는 lib/logger.ts가 env.LOG_LEVEL로 pino를 초기화하므로 같이 채운다.
  env: { LOG_LEVEL: 'silent' },
}));

// geocode-enrich.ts는 candidate 후보마다 geocode → (실패시) geocodeKeyword 순으로 시도한다.
// 실제 카카오 호출 없이 후보/검증 로직만 검증하기 위해 둘 다 모킹한다.
const geocodeMock = vi.fn();
const geocodeKeywordMock = vi.fn();
vi.mock('@/scripts/ingest/geocoder', () => ({
  geocode: (q: string) => geocodeMock(q),
  geocodeKeyword: (q: string) => geocodeKeywordMock(q),
}));

import { enrichNoticesWithGeocode } from '@/scripts/ingest/subscriptions/geocode-enrich';

beforeEach(() => {
  geocodeMock.mockReset();
  geocodeKeywordMock.mockReset();
});

describe('enrichNoticesWithGeocode', () => {
  it('지역이 맞으면 좌표를 채운다', async () => {
    geocodeMock.mockResolvedValue({ lat: 37.55, lng: 127.14, region1: '서울특별시', region2: '강동구' });
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: 37.55, lng: 127.14 });
  });

  it('지역이 어긋나면 채우지 않는다 — 후보가 하나뿐이면 그대로 실패로 남는다', async () => {
    // '고덕로 399'는 동/리 토큰이 없어 geocodeCandidates가 '서울특별시 강동구' 단일 후보만 만든다.
    geocodeMock.mockResolvedValue({ lat: 37.49, lng: 127.06, region1: '서울특별시', region2: '강남구' });
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: null, lng: null });
    // 후보가 하나뿐이므로 keyword 폴백까지는 안 간다(geocode가 이미 좌표를 줬으므로).
    expect(geocodeKeywordMock).not.toHaveBeenCalled();
  });

  it('이미 좌표가 있으면 호출하지 않는다', async () => {
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: 1, lng: 2 }];
    await enrichNoticesWithGeocode(rows);
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(geocodeKeywordMock).not.toHaveBeenCalled();
  });

  it('주소가 없으면 호출하지 않는다', async () => {
    const rows = [{ address: null, lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(geocodeKeywordMock).not.toHaveBeenCalled();
  });

  it('주소검색이 비면 키워드검색으로 폴백하고, 지역이 맞으면 채운다', async () => {
    geocodeMock.mockResolvedValue(null);
    geocodeKeywordMock.mockResolvedValue({ lat: 37.55, lng: 127.14, region1: '서울특별시', region2: '강동구' });
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: 37.55, lng: 127.14 });
    expect(geocodeKeywordMock).toHaveBeenCalled();
  });

  it('첫 후보가 지역불일치면 다음 후보를 마저 시도한다', async () => {
    // 동 토큰이 있는 주소는 후보가 2개 이상(동+지번, 동) 나온다 — 첫 후보가 어긋나도 다음 후보로 복구되는지 확인.
    const address = '경기도 군포시 속달동 90-3번지(군포대야미 공공주택지구 B1블럭)';
    geocodeMock
      .mockResolvedValueOnce({ lat: 1, lng: 2, region1: '경기도', region2: '수원시 팔달구' }) // 첫 후보: 지역불일치
      .mockResolvedValueOnce({ lat: 37.36, lng: 126.93, region1: '경기도', region2: '군포시' }); // 둘째 후보: 일치
    const rows = [{ address, lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: 37.36, lng: 126.93 });
    expect(geocodeMock).toHaveBeenCalledTimes(2);
  });

  it('여러 행을 한 배열로 처리한다 — 배치 호출', async () => {
    geocodeMock.mockImplementation(async (q: string) =>
      q.includes('강동구')
        ? { lat: 37.55, lng: 127.14, region1: '서울특별시', region2: '강동구' }
        : { lat: 37.2, lng: 127.0, region1: '경기도', region2: '수원시' },
    );
    const rows = [
      { address: '서울특별시 강동구 고덕로 399', lat: null, lng: null },
      { address: '경기도 수원시 매탄로 1', lat: null, lng: null },
    ];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: 37.55, lng: 127.14 });
    expect(rows[1]).toMatchObject({ lat: 37.2, lng: 127.0 });
  });
});
