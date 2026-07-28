import { describe, it, expect } from 'vitest';
import { shortSido } from '@/lib/region';

describe('shortSido', () => {
  it('시도 풀네임을 축약명으로 바꾼다', () => {
    expect(shortSido('대전광역시')).toBe('대전');
    expect(shortSido('서울특별시')).toBe('서울');
    expect(shortSido('경기도')).toBe('경기');
    expect(shortSido('강원특별자치도')).toBe('강원');
  });

  // 2026-07-01 광주+전남 통합
  it('통합 시도도 축약명을 낸다', () => {
    expect(shortSido('전남광주통합특별시')).toBe('전남광주');
  });

  // sidoPrefix()는 행정구역 코드 앞 2자리를 내므로 표시용으로 쓸 수 없다. 혼동 방지용 회귀선.
  it('코드가 아니라 이름을 낸다', () => {
    expect(shortSido('대전광역시')).not.toBe('30');
  });

  it('SIDO_LIST에 없는 시도는 undefined', () => {
    expect(shortSido('없는시도')).toBeUndefined();
    expect(shortSido('')).toBeUndefined();
  });
});
