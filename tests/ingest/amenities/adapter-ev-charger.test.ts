import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvChargerXml } from '@/scripts/ingest/amenities/adapter-ev-charger';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/ev-charger-sample.xml'),
  'utf-8',
);

describe('adapter-ev-charger', () => {
  it('그룹화: 동일 statId의 충전기를 1개 행으로 합친다', () => {
    const { rows, totalCount } = parseEvChargerXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(2); // ST001, ST002 각 1개
  });

  it('ST001: 급속+완속 혼합 → chargeSpeed=급속', () => {
    const { rows } = parseEvChargerXml(xml);
    const st001 = rows.find((r) => r.sourceId === 'ST001');
    expect(st001).toBeDefined();
    expect(st001!.name).toBe('서울역 EV충전소');
    expect(st001!.chargeSpeed).toBe('급속');
    expect(st001!.chargerCount).toBe(2);
    expect(st001!.lat).toBeCloseTo(37.555946);
    expect(st001!.lng).toBeCloseTo(126.972317);
    expect(st001!.operatorName).toBe('환경부');
  });

  it('ST002: 완속만 → chargeSpeed=완속', () => {
    const { rows } = parseEvChargerXml(xml);
    const st002 = rows.find((r) => r.sourceId === 'ST002');
    expect(st002!.chargeSpeed).toBe('완속');
    expect(st002!.chargerCount).toBe(1);
  });
});
