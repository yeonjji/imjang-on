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
    const { rows, totalCount } = parseStoreXml(xml);
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('소분류 업종명을 우선 저장한다 (카페)', () => {
    const { rows } = parseStoreXml(xml);
    const sb = rows.find((r) => r.sourceId === 'B001');
    expect(sb).toBeDefined();
    expect(sb!.name).toBe('스타벅스 강남점');
    expect(sb!.industryCode).toBe('I21201');
    expect(sb!.industryName).toBe('카페');
    expect(sb!.sigunguCode).toBe('11680');
    expect(sb!.lat).toBeCloseTo(37.498095);
  });

  it('편의점도 소분류로 파싱된다', () => {
    const { rows } = parseStoreXml(xml);
    const gs = rows.find((r) => r.sourceId === 'B002');
    expect(gs!.industryCode).toBe('G20405');
    expect(gs!.industryName).toBe('편의점');
  });

  it('HTML 엔티티로 인코딩된 이름을 디코딩한다 (data.go.kr 이중 인코딩)', () => {
    // API가 '<주>세븐'을 '&amp;lt;주&amp;gt;세븐'으로 이중 인코딩 → XML 파서가 1차 디코딩(&amp;→&)으로
    // '&lt;주&gt;세븐'이 되고, parseStoreXml의 decodeEntities가 2차 디코딩해 '<주>세븐'이 된다.
    const encoded = xml.replace('스타벅스 강남점', '&amp;lt;주&amp;gt;세븐');
    const { rows } = parseStoreXml(encoded);
    const sb = rows.find((r) => r.sourceId === 'B001');
    expect(sb!.name).toBe('<주>세븐');
  });

  it('좌표 없는 항목은 row는 유지하되 lat/lng를 null로 둔다', () => {
    const xmlWithEmpty = xml.replace('<lat>37.498095</lat>', '<lat>0</lat>');
    const { rows } = parseStoreXml(xmlWithEmpty);
    expect(rows).toHaveLength(2);
    const sb = rows.find((r) => r.sourceId === 'B001');
    expect(sb!.lat).toBeNull();
  });
});
