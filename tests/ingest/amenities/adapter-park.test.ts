import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkXml } from '@/scripts/ingest/amenities/adapter-park';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/park-sample.xml'),
  'utf-8',
);

describe('adapter-park', () => {
  it('좌표 없어도 row를 생성하고 lat/lng는 null로 둔다', () => {
    const { rows, totalCount } = parseParkXml(xml);
    expect(totalCount).toBe(4);
    expect(rows).toHaveLength(4); // PK003은 좌표 0이지만 row 유지, lat/lng는 null
    const pk003 = rows.find((r) => r.sourceId === 'PK003');
    expect(pk003!.lat).toBeNull();
    expect(pk003!.lng).toBeNull();
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

  it('도로명주소 비어있으면 지번주소로 fallback', () => {
    const { rows } = parseParkXml(xml);
    const park = rows.find((r) => r.sourceId === 'PK004');
    expect(park!.address).toBe('부산광역시 사하구 다대동 113-7');
  });

  it('parkType 없는 경우 null 처리', () => {
    const xmlNoType = xml.replace('<parkSe>근린공원</parkSe>', '');
    const { rows } = parseParkXml(xmlNoType);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.parkType).toBeNull();
  });

  it('면적 없는 경우 null 처리', () => {
    const xmlNoArea = xml.replace('<parkAr>2950000</parkAr>', '');
    const { rows } = parseParkXml(xmlNoArea);
    const park = rows.find((r) => r.sourceId === 'PK001');
    expect(park!.area).toBeNull();
  });

  it('referenceDate가 있으면 Date로 파싱하고, 없으면 null', () => {
    const { rows } = parseParkXml(xml);
    const withRef = rows.find((r) => r.sourceId === 'PK001');
    expect(withRef!.referenceDate).toEqual(new Date(Date.UTC(2025, 10, 5)));
    const withoutRef = rows.find((r) => r.sourceId === 'PK002');
    expect(withoutRef!.referenceDate).toBeNull();
  });
});
