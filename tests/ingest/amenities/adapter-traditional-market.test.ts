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
    const gwang = rows.find((r) => r.name === '광장시장');
    expect(gwang).toBeDefined();
    expect(gwang!.marketType).toBe('종합시장');
    expect(gwang!.address).toBe('서울특별시 종로구 창경궁로 88');
    expect(gwang!.lat).toBeCloseTo(37.57018);
    expect(gwang!.lng).toBeCloseTo(126.99956);
    // 고유 ID가 없어 name+address 해시로 안정적인 sourceId를 만든다
    expect(gwang!.sourceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('도로명주소가 없으면 지번주소로 대체한다', () => {
    const { rows } = parseTraditionalMarketXml(xml);
    const wolseong = rows.find((r) => r.name === '월성청구시장');
    expect(wolseong!.address).toBe('대구광역시 달서구 월성동 89-2');
  });

  it('좌표 없는 항목은 row는 유지하되 lat/lng를 null로 둔다', () => {
    const { rows } = parseTraditionalMarketXml(xml);
    const wolseong = rows.find((r) => r.name === '월성청구시장');
    expect(wolseong).toBeDefined();
    expect(wolseong!.lat).toBeNull();
    expect(wolseong!.lng).toBeNull();
  });
});
