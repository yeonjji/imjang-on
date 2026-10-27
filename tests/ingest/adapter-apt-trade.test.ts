import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterAptTrade } from '@/scripts/ingest/transactions/adapter-apt-trade';

const xml = readFileSync(resolve('tests/ingest/fixtures/apt-trade-sample.xml'), 'utf-8');

describe('adapter-apt-trade', () => {
  it('parses one row from sample', () => {
    const { rows, totalCount } = adapterAptTrade.parseRows(xml, '11650');
    expect(totalCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      propertyType: 'APARTMENT',
      dealType: 'SALE',
      name: '래미안서초에스티지',
      buildYear: 2009,
      dealAmount: 302_000,
      exclusiveArea: 84.99,
      floor: 12,
      sigunguCode: '11650',
      umd: '반포동',
      roadName: '반포대로',
    });
    expect(rows[0].contractDate.toISOString().slice(0, 10)).toBe('2025-05-12');
  });

  it('해제일·등기일 YY.MM.DD 형식을 20YY로 읽는다(1900년대로 읽던 버그)', () => {
    const x = xml
      .replace('<rgstDate>20250520</rgstDate>', '<rgstDate>26.10.16</rgstDate><cdealType>O</cdealType><cdealDay>26.09.09</cdealDay>');
    const [row] = adapterAptTrade.parseRows(x, '11650').rows;
    expect(row.cancelType).toBe('O');
    expect(row.cancelDate?.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(row.registerDate?.toISOString().slice(0, 10)).toBe('2026-10-16');
  });

  it('YYYYMMDD 8자리는 그대로 읽고, 빈 값·잘못된 값은 null', () => {
    const [row] = adapterAptTrade.parseRows(xml, '11650').rows;
    expect(row.registerDate?.toISOString().slice(0, 10)).toBe('2025-05-20');
    expect(row.cancelDate).toBeNull();
    const bad = xml.replace('<rgstDate>20250520</rgstDate>', '<rgstDate>26.13.40</rgstDate><cdealDay> </cdealDay>');
    const [r2] = adapterAptTrade.parseRows(bad, '11650').rows;
    expect(r2.registerDate).toBeNull();
    expect(r2.cancelDate).toBeNull();
  });
});
