import { describe, it, expect } from 'vitest';
import { isMapEntityKind, parseMapEntityId } from '@/lib/seo/map-entity';

describe('isMapEntityKind', () => {
  it('화이트리스트에 있는 kind는 통과', () => {
    for (const k of ['property', 'subscription', 'school', 'hospital', 'pharmacy', 'childcare', 'park', 'parking', 'charger', 'store', 'market']) {
      expect(isMapEntityKind(k)).toBe(true);
    }
  });

  it('화이트리스트 밖은 거부', () => {
    expect(isMapEntityKind('urban')).toBe(false);
    expect(isMapEntityKind('Property')).toBe(false);
    expect(isMapEntityKind('')).toBe(false);
  });

  it('Object.prototype 상속 키를 kind로 오인하지 않는다', () => {
    expect(isMapEntityKind('toString')).toBe(false);
    expect(isMapEntityKind('constructor')).toBe(false);
  });
});

describe('parseMapEntityId', () => {
  it('양의 정수 문자열을 bigint로 파싱', () => {
    expect(parseMapEntityId('123')).toBe(123n);
  });

  it('숫자가 아니거나 음수·소수·과대 길이는 null', () => {
    expect(parseMapEntityId('12a')).toBeNull();
    expect(parseMapEntityId('-1')).toBeNull();
    expect(parseMapEntityId('1.5')).toBeNull();
    expect(parseMapEntityId('')).toBeNull();
    expect(parseMapEntityId('1'.repeat(20))).toBeNull();
  });
});
