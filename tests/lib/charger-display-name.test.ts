import { describe, it, expect } from 'vitest';
import { displayName } from '@/lib/urban/adapters/charger';

describe('displayName', () => {
  it('선행 언더스코어 제거', () => {
    expect(displayName('_홍길동충전소')).toBe('홍길동충전소');
    expect(displayName('__한국전력')).toBe('한국전력');
  });

  it('선행 언더스코어가 없으면 그대로 반환', () => {
    expect(displayName('홍길동충전소')).toBe('홍길동충전소');
  });

  it('중간/끝의 언더스코어는 보존', () => {
    expect(displayName('GS_칼텍스_역삼')).toBe('GS_칼텍스_역삼');
    expect(displayName('_GS_칼텍스')).toBe('GS_칼텍스');
  });
});
