import { describe, it, expect } from 'vitest';
import { KOREA_BBOX, isInKoreaBbox } from '@/lib/geo/korea-bbox';

describe('korea-bbox', () => {
  it('서울 좌표는 내부', () => {
    expect(isInKoreaBbox(126.978, 37.5665)).toBe(true); // 서울시청
  });
  it('제주 남단·서해5도 경계 근처도 내부', () => {
    expect(isInKoreaBbox(126.27, 33.1)).toBe(true);  // 제주
    expect(isInKoreaBbox(124.7, 37.96)).toBe(true);  // 백령도 인근
  });
  it('위경도 뒤바뀜은 외부', () => {
    expect(isInKoreaBbox(37.5665, 126.978)).toBe(false); // lng/lat swap
  });
  it('0좌표·해외는 외부', () => {
    expect(isInKoreaBbox(0, 0)).toBe(false);
    expect(isInKoreaBbox(-122.4, 37.77)).toBe(false); // SF
  });
  it('상수는 위도 33.0~38.7 / 경도 124.0~132.0', () => {
    expect(KOREA_BBOX).toEqual({ minLat: 33.0, maxLat: 38.7, minLng: 124.0, maxLng: 132.0 });
  });
});
