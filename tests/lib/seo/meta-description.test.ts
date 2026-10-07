import { describe, it, expect } from 'vitest';
import { nameWithAddress } from '@/lib/seo/meta-description';

describe('nameWithAddress', () => {
  it('주소를 괄호로 붙여 동명 시설의 description이 갈리게 한다', () => {
    expect(nameWithAddress('공한지주차장', '전라남도 완도군 완도읍 1')).toBe('공한지주차장(전라남도 완도군 완도읍 1)');
    expect(nameWithAddress('공한지주차장', '전라남도 완도군 완도읍 1'))
      .not.toBe(nameWithAddress('공한지주차장', '전라남도 완도군 완도읍 2'));
  });

  it('주소가 비어 있으면 이름만 낸다', () => {
    expect(nameWithAddress('소공원', '')).toBe('소공원');
    expect(nameWithAddress('소공원', '   ')).toBe('소공원');
  });
});
