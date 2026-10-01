import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTraditionalMarketXml } from '@/scripts/ingest/amenities/adapter-traditional-market';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml'),
  'utf-8',
);
const rows = parseTraditionalMarketXml(xml).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-traditional-market 상세 필드', () => {
  it('장호원전통시장: 9개 필드를 원문 그대로 담는다', () => {
    const m = byName('장호원전통시장');
    expect(m.storeCount).toBe(64);
    expect(m.openCycle).toBe('4일+9일');
    expect(m.establishedYear).toBe(1955);
    expect(m.products).toBe('농산물+축산물+수산물+가공식품+의류+신발+가정용품+음식점+근린생활서비스');
    expect(m.hasParking).toBe(true);
    expect(m.hasToilet).toBe(true);
    expect(m.tel).toBe('031-643-1330');
    expect(m.homepage).toBe('http://www.jmarket.org/');
    expect(m.referenceDate?.toISOString()).toBe('2025-11-10T00:00:00.000Z');
  });

  it('사기막골도자기시장: 매일장, 주차장 N, 스킴 없는 홈페이지', () => {
    const m = byName('사기막골도자기시장');
    expect(m.openCycle).toBe('매일');
    expect(m.hasParking).toBe(false);
    expect(m.homepage).toBe('www.sagimakgol.com');
  });

  it('경계사례: 범위 밖·형식 위반 값은 null, 긴 문자열은 잘린다', () => {
    const m = byName('경계사례시장');
    expect(m.storeCount).toBeNull(); // 0곳은 의미 없음
    expect(m.openCycle).toBeNull(); // 빈 값
    expect(m.establishedYear).toBeNull(); // 1700 미만
    expect(m.hasToilet).toBeNull(); // 'X'
    expect(m.hasParking).toBeNull(); // 빈 값
    expect(m.referenceDate).toBeNull(); // YYYYMMDD 형식
    expect(m.products).toHaveLength(300); // VARCHAR(300)
  });

  it('경계사례: XML 파서가 숫자로 바꾼 전화번호(앞자리 0 유실)는 버린다', () => {
    expect(byName('경계사례시장').tel).toBeNull();
  });

  it('sourceId는 기존과 같은 이름+주소 해시 규칙을 유지한다', () => {
    expect(byName('장호원전통시장').sourceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
