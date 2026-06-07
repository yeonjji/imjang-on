import { describe, it, expect } from 'vitest';
import { serializeProperty } from '@/lib/property';

const row = {
  id: 123n,
  propertyType: 'APARTMENT',
  name: '래미안',
  builtYear: 2018,
  households: 500,
  txCount12m: 12,
  saleCount12m: 4,
  saleLastPrice: 1850000000n,
  saleAvgPrice12m: 1800000000n,
  jeonseCount12m: 3,
  jeonseLastDeposit: 980000000n,
  jeonseAvgDeposit12m: 970000000n,
  wolseCount12m: 2,
  wolseLastDeposit: 100000000n,
  wolseLastRent: 280,
  region: { fullName: '서울 서대문구 연희동' },
} as never;

describe('serializeProperty', () => {
  it('id는 문자열, BigInt 가격은 number로 변환', () => {
    const dto = serializeProperty(row);
    expect(dto.id).toBe('123');
    expect(dto.saleLastPrice).toBe(1850000000);
    expect(dto.jeonseAvgDeposit12m).toBe(970000000);
    expect(typeof dto.saleAvgPrice12m).toBe('number');
  });

  it('null 가격은 null 유지, Int 필드는 그대로', () => {
    const rowWithNull = {
      id: 123n,
      propertyType: 'APARTMENT',
      name: '래미안',
      builtYear: 2018,
      households: 500,
      txCount12m: 12,
      saleCount12m: 4,
      saleLastPrice: null,
      saleAvgPrice12m: 1800000000n,
      jeonseCount12m: 3,
      jeonseLastDeposit: 980000000n,
      jeonseAvgDeposit12m: 970000000n,
      wolseCount12m: 2,
      wolseLastDeposit: 100000000n,
      wolseLastRent: 280,
      region: { fullName: '서울 서대문구 연희동' },
    } as never;
    const dto = serializeProperty(rowWithNull);
    expect(dto.saleLastPrice).toBeNull();
    expect(dto.wolseLastRent).toBe(280);
    expect(dto.txCount12m).toBe(12);
    expect(dto.region.fullName).toBe('서울 서대문구 연희동');
  });

  it('JSON 직렬화 가능(BigInt 없음)', () => {
    expect(() => JSON.stringify(serializeProperty(row))).not.toThrow();
  });
});
