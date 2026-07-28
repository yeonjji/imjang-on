import { describe, it, expect } from 'vitest';
import { buildAddress } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';
import { PropertyType, DealType } from '@prisma/client';

function row(over: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    propertyType: PropertyType.APARTMENT,
    dealType: DealType.JEONSE,
    name: '루원더퍼스트',
    buildYear: 2019,
    contractDate: new Date('2023-02-10'),
    exclusiveArea: 59.96,
    floor: 9,
    dealAmount: null,
    registerDate: null,
    dealingType: null,
    buyerType: null,
    sellerType: null,
    cancelDate: null,
    cancelType: null,
    deposit: 20_000,
    monthlyRent: 0,
    contractTerm: null,
    contractType: null,
    useRRRight: null,
    preDeposit: null,
    preMonthlyRent: null,
    sigunguCode: '28275',
    umd: '가정동',
    jibun: '597-1',
    roadName: null,
    externalKey: null,
    ...over,
  };
}

describe('buildAddress', () => {
  it('법정동 + 지번으로 조립한다', () => {
    expect(buildAddress(row({}))).toBe('가정동 597-1');
  });

  // Property.address는 propertyAddress()가 "법정동 + 지번"으로 파싱한다(lib/property.ts).
  // 도로명을 사이에 끼우면 "가정동 봉오재2로 13 597-1"이 되어 도로명이 법정동으로
  // 둔갑한 하이브리드 주소가 만들어진다 — 실존하지 않는 주소다.
  it('도로명주소가 있어도 address에는 넣지 않는다', () => {
    const addr = buildAddress(row({ roadName: '봉오재2로 13' }));
    expect(addr).toBe('가정동 597-1');
    expect(addr).not.toContain('봉오재2로');
  });

  it('지번이 없으면 법정동만 남긴다', () => {
    expect(buildAddress(row({ jibun: null, roadName: '봉오재2로 13' }))).toBe('가정동');
  });

  it('법정동도 지번도 없으면 빈 문자열', () => {
    expect(buildAddress(row({ umd: null, jibun: null, roadName: '봉오재2로 13' }))).toBe('');
  });
});
