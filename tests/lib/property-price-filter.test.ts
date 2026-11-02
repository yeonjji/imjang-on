import { describe, it, expect } from 'vitest';
import { buildPriceCondition, buildPriceWhere } from '@/lib/property';

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

describe('buildPriceWhere', () => {
  it('가격 조건·가격 정렬이 없으면 아무 조건도 추가하지 않는다', () => {
    expect(buildPriceWhere('all', undefined, undefined, false)).toEqual({});
  });

  it('거래유형 전체는 매매 마지막 거래가로 거른다 (화면 문구 "매매가 기준")', () => {
    expect(buildPriceWhere('all', undefined, 50_000, false)).toEqual({
      saleCount12m: { gt: 0 },
      saleLastPrice: { lte: BigInt(50_000) },
    });
  });

  it('전세·월세는 각 마지막 보증금으로 거른다', () => {
    expect(buildPriceWhere('jeonse', 10_000, 30_000, false)).toEqual({
      jeonseCount12m: { gt: 0 },
      jeonseLastDeposit: { gte: BigInt(10_000), lte: BigInt(30_000) },
    });
    expect(buildPriceWhere('wolse', undefined, 5_000, false)).toEqual({
      wolseCount12m: { gt: 0 },
      wolseLastDeposit: { lte: BigInt(5_000) },
    });
  });

  it('가격 정렬만 있어도 기준 거래유형의 12개월 거래를 요구한다 (안 보이는 옛 가격으로 정렬 방지)', () => {
    expect(buildPriceWhere('all', undefined, undefined, true)).toEqual({ saleCount12m: { gt: 0 } });
  });
});
