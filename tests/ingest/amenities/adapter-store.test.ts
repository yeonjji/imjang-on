import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStoreXml } from '@/scripts/ingest/amenities/adapter-store';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/store-sample.xml'),
  'utf-8',
);

describe('adapter-store', () => {
  it('2개 상가를 파싱한다', () => {
    const { rows, totalCount } = parseStoreXml(xml, '11680');
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('스타벅스 파싱 결과', () => {
    const { rows } = parseStoreXml(xml, '11680');
    const sb = rows.find((r) => r.sourceId === 'B001');
    expect(sb).toBeDefined();
    expect(sb!.name).toBe('스타벅스 강남점');
    expect(sb!.industryCode).toBe('Q');
    expect(sb!.industryName).toBe('음식');
    expect(sb!.sigunguCode).toBe('11680');
    expect(sb!.lat).toBeCloseTo(37.498095);
  });

  it('좌표 없는 항목은 건너뛴다', () => {
    const xmlWithEmpty = xml.replace('<lat>37.498095</lat>', '<lat>0</lat>');
    const { rows } = parseStoreXml(xmlWithEmpty, '11680');
    expect(rows).toHaveLength(1);
  });
});
