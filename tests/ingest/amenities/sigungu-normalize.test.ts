import { describe, it, expect } from 'vitest';
import { ilbanguToSiMap } from '@/scripts/ingest/amenities/sigungu-normalize';

describe('ilbanguToSiMap', () => {
  it('일반구(level-3, 코드끝 00000)를 부모 시코드로 매핑한다', () => {
    const map = ilbanguToSiMap([
      { code: '4111300000', level: 3 }, // 수원시 권선구 → 41110
      { code: '4113500000', level: 3 }, // 성남시 분당구 → 41130
    ]);
    expect(map.get('41113')).toBe('41110');
    expect(map.get('41135')).toBe('41130');
    expect(map.size).toBe(2);
  });

  it('읍면동(level-3이지만 코드끝 비00000)은 제외한다', () => {
    const map = ilbanguToSiMap([
      { code: '4111312600', level: 3 }, // 권선구 읍면동
    ]);
    expect(map.size).toBe(0);
  });

  it('자치구·시군구(level-2)는 매핑하지 않는다', () => {
    const map = ilbanguToSiMap([
      { code: '1171000000', level: 2 }, // 서울 송파구 (자치구)
      { code: '4111000000', level: 2 }, // 수원시 (통합시 본체)
    ]);
    expect(map.size).toBe(0);
  });
});
