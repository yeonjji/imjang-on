import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkXml } from '@/scripts/ingest/amenities/adapter-park';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/park-sample.xml'),
  'utf-8',
);

describe('adapter-park', () => {
  it('좌표 있는 항목만 파싱한다', () => {
    const { rows, totalCount } = parseParkXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2);
  });

  it('남산공원 파싱 결과', () => {
    const { rows } = parseParkXml(xml);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park).toBeDefined();
    expect(park!.name).toBe('남산공원');
    expect(park!.address).toBe('서울특별시 중구 삼일대로 231');
    expect(park!.parkType).toBe('근린공원');
    expect(park!.area).toBe(2950000);
    expect(park!.lat).toBeCloseTo(37.55);
    expect(park!.lng).toBeCloseTo(126.988);
  });

  it('parkType 없는 경우 null 처리', () => {
    const xmlNoType = xml.replace('<PARK_SE>근린공원</PARK_SE>', '');
    const { rows } = parseParkXml(xmlNoType);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.parkType).toBeNull();
  });

  it('면적 없는 경우 null 처리', () => {
    const xmlNoArea = xml.replace('<PARK_AR>2950000</PARK_AR>', '');
    const { rows } = parseParkXml(xmlNoArea);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.area).toBeNull();
  });
});
