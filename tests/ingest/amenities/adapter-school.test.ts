import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSchoolXml } from '@/scripts/ingest/amenities/adapter-school';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/school-sample.xml'),
  'utf-8',
);

describe('adapter-school', () => {
  it('좌표 있는 항목만 파싱한다', () => {
    const { rows, totalCount } = parseSchoolXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2);
  });

  it('서울초등학교 파싱 결과', () => {
    const { rows } = parseSchoolXml(xml);
    const school = rows.find((r) => r.sourceId === 'SC001');
    expect(school).toBeDefined();
    expect(school!.name).toBe('서울초등학교');
    expect(school!.address).toBe('서울특별시 종로구 창경궁로 1');
    expect(school!.schoolLevel).toBe('초등학교');
    expect(school!.schoolType).toBe('공립');
    expect(school!.lat).toBeCloseTo(37.57);
    expect(school!.lng).toBeCloseTo(126.99);
  });

  it('schoolType 없는 경우 null 처리', () => {
    const xmlNoType = xml.replace('<fondType>공립</fondType>', '');
    const { rows } = parseSchoolXml(xmlNoType);
    const school = rows.find((r) => r.sourceId === 'SC001');
    expect(school!.schoolType).toBeNull();
  });
});
