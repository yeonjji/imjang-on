import { describe, it, expect } from 'vitest';
import { parseListParams } from '@/lib/list-params';

describe('parseListParams', () => {
  it('기본값: all 타입·deal all·sort recent·page 1', () => {
    const p = parseListParams({});
    expect(p.types.length).toBe(4);
    expect(p.deal).toBe('all');
    expect(p.sort).toBe('recent');
    expect(p.page).toBe(1);
  });

  it('apt 슬러그 → APARTMENT 단일, price/page 숫자 변환', () => {
    const p = parseListParams({ type: 'apt', price_min: '10000', page: '3' });
    expect(p.types).toEqual(['APARTMENT']);
    expect(p.priceMin).toBe(10000);
    expect(p.page).toBe(3);
  });

  it('page는 최소 1로 보정, q는 trim', () => {
    expect(parseListParams({ page: '0' }).page).toBe(1);
    expect(parseListParams({ q: '  연희동  ' }).q).toBe('연희동');
    expect(parseListParams({ q: '   ' }).q).toBeUndefined();
  });
});
