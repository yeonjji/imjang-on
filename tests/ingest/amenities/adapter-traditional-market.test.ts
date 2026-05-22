import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTraditionalMarketXml } from '@/scripts/ingest/amenities/adapter-traditional-market';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/traditional-market-sample.xml'),
  'utf-8',
);

describe('adapter-traditional-market', () => {
  it('2개 시장을 파싱한다', () => {
    const { rows, totalCount } = parseTraditionalMarketXml(xml);
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('광장시장 파싱 결과', () => {
    const { rows } = parseTraditionalMarketXml(xml);
    const gwang = rows.find((r) => r.sourceId === 'M001');
    expect(gwang).toBeDefined();
    expect(gwang!.name).toBe('광장시장');
    expect(gwang!.marketType).toBe('종합시장');
    expect(gwang!.lat).toBeCloseTo(37.57018);
    expect(gwang!.lng).toBeCloseTo(126.99956);
  });

  it('좌표 없는 항목은 건너뛴다', () => {
    const xmlWithEmpty = xml.replace('<la>37.570180</la>', '<la>0</la>');
    const { rows } = parseTraditionalMarketXml(xmlWithEmpty);
    expect(rows).toHaveLength(1);
  });
});
