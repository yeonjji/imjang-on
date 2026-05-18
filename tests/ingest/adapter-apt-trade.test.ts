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
});
