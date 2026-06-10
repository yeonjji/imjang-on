import { describe, it, expect } from 'vitest';
import { buildPriceCondition } from '@/lib/property';

describe('buildPriceCondition', () => {
  it('priceMin/priceMax 미지정 시 undefined 반환', () => {
    expect(buildPriceCondition(undefined, undefined)).toBeUndefined();
  });

  it('priceMin만 지정 시 gte 조건 반환 (만원 단위 그대로 비교)', () => {
    const result = buildPriceCondition(50_000, undefined);
    expect(result).toEqual({ gte: BigInt(50_000) });
  });

  it('priceMax만 지정 시 lte 조건 반환', () => {
    const result = buildPriceCondition(undefined, 100_000);
    expect(result).toEqual({ lte: BigInt(100_000) });
  });

  it('priceMin=0은 gte 조건 없이 처리 (전체 최솟값)', () => {
    const result = buildPriceCondition(0, 50_000);
    expect(result).toEqual({ lte: BigInt(50_000) });
  });

  it('priceMin + priceMax 둘 다 있으면 range 반환', () => {
    const result = buildPriceCondition(50_000, 100_000);
    expect(result).toEqual({
      gte: BigInt(50_000),
      lte: BigInt(100_000),
    });
  });
});
