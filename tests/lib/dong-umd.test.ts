import { describe, it, expect } from 'vitest';
import { umdOfProperty } from '@/lib/transaction/dong';

// Property.address는 umd + ' ' + jibun으로 조립된다(lib/property.ts:93).
// 마지막 토큰만 떼면 실거래 Transaction.umd와 같은 형식이 나온다.
// 실측: 표본 3,000건 중 2,970건(99.0%) 일치.
describe('umdOfProperty', () => {
  it('지번을 뗀다', () => {
    expect(umdOfProperty('범어동 2272')).toBe('범어동');
  });
  it('가지번도 하나의 토큰으로 본다', () => {
    expect(umdOfProperty('가락동 164-1')).toBe('가락동');
  });
  it('읍면+리는 통째로 남긴다 — 실거래 umd가 그 형식이다', () => {
    expect(umdOfProperty('고촌읍 신곡리 100')).toBe('고촌읍 신곡리');
  });
  it('동1가 표기를 유지한다', () => {
    expect(umdOfProperty('수성동1가 15')).toBe('수성동1가');
  });
  it('공백이 여러 개여도 마지막 토큰만 뗀다', () => {
    expect(umdOfProperty('범어동   2272')).toBe('범어동');
  });
  it('토큰이 하나뿐이면 그대로 둔다', () => {
    expect(umdOfProperty('범어동')).toBe('범어동');
  });
});
