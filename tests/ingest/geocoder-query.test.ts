import { describe, it, expect } from 'vitest';
import { buildGeocodeQuery } from '@/scripts/ingest/geocoder';

describe('buildGeocodeQuery', () => {
  it('시/도·시군구 접두사를 주소 앞에 붙인다', () => {
    expect(buildGeocodeQuery('서울특별시 성동구', '금호동1가 1823')).toBe(
      '서울특별시 성동구 금호동1가 1823',
    );
  });

  it('다른 지역도 접두사로 동명 모호성을 제거한다', () => {
    expect(buildGeocodeQuery('광주광역시 서구', '금호동 787')).toBe('광주광역시 서구 금호동 787');
    expect(buildGeocodeQuery('전라남도 광양시', '금호동 713')).toBe('전라남도 광양시 금호동 713');
  });

  it('접두사가 없으면(null/undefined/빈문자) 주소만 반환', () => {
    expect(buildGeocodeQuery(null, '금호동 787')).toBe('금호동 787');
    expect(buildGeocodeQuery(undefined, '금호동 787')).toBe('금호동 787');
    expect(buildGeocodeQuery('', '금호동 787')).toBe('금호동 787');
  });

  it('중복 공백을 한 칸으로 정리한다', () => {
    expect(buildGeocodeQuery('서울특별시  성동구 ', '  금호동  787 ')).toBe(
      '서울특별시 성동구 금호동 787',
    );
  });
});
