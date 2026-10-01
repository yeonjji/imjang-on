import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkXml } from '@/scripts/ingest/amenities/adapter-park';

const xml = readFileSync(resolve('tests/ingest/amenities/fixtures/park-detail-sample.xml'), 'utf-8');
const rows = parseParkXml(xml).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-park 상세 필드', () => {
  it('시설 4종·지정 고시일·관리기관·전화를 원문 그대로 담는다', () => {
    const p = byName('근린공원 1호(황해자유구역 현덕지구)');
    expect(p.facilitySport).toBe('야외헬스기구+체력단련시설');
    expect(p.facilityPlay).toBe('조합놀이대+그네');
    expect(p.facilityConvenience).toBe('정자,의자/음수전');
    expect(p.facilityCulture).toBe('화장실+야외무대');
    expect(p.designatedAt?.toISOString()).toBe('2016-06-17T00:00:00.000Z');
    expect(p.managingOrg).toBe('경기도 평택시청');
    expect(p.tel).toBe('031-8024-4248');
  });

  it('기타 시설(etcFclty)은 담지 않는다', () => {
    expect(byName('근린공원 1호(황해자유구역 현덕지구)')).not.toHaveProperty('facilityEtc');
  });

  it('빈 값은 null, 숫자로 바뀐 전화번호는 버린다', () => {
    const p = byName('빈시설공원');
    expect(p.facilitySport).toBeNull();
    expect(p.facilityPlay).toBeNull();
    expect(p.facilityConvenience).toBeNull();
    expect(p.facilityCulture).toBeNull();
    expect(p.designatedAt).toBeNull();
    expect(p.managingOrg).toBeNull();
    expect(p.tel).toBeNull();
  });
});
