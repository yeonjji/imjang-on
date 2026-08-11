import { describe, it, expect } from 'vitest';
import {
  HEAVY_BLOCK_KEYS,
  GUIDE_SNAPSHOT_KEYS,
  guideSnapshotKey,
} from '@/lib/guide/data-snapshot';
import { GUIDE_DATA_BLOCK_KEYS, isGuideDataBlockKey } from '@/lib/guide/data-blocks';
import { computeAreaPrice } from '@/lib/guide/blocks/heavy/area-price';
import { computeFloorPremium } from '@/lib/guide/blocks/heavy/floor-premium';
import { computePriceTrend } from '@/lib/guide/blocks/heavy/price-trend';
import { computeSubwayPremium, WALK_RADIUS_METERS } from '@/lib/guide/blocks/heavy/subway-premium';
import { computeLtvByRegion, EXAMPLE_LTV_PCT } from '@/lib/guide/blocks/heavy/ltv-by-region';

describe('스냅샷 키', () => {
  it('블록키를 스냅샷키로 바꾼다', () => {
    expect(guideSnapshotKey('area-price')).toBe('guide_area_price');
    expect(guideSnapshotKey('price-trend-24m')).toBe('guide_price_trend_24m');
    expect(guideSnapshotKey('subway-premium')).toBe('guide_subway_premium');
  });

  it('DashboardSnapshot.key 길이 제한(40)을 넘지 않는다', () => {
    for (const k of GUIDE_SNAPSHOT_KEYS) {
      expect(k.length).toBeLessThanOrEqual(40);
      expect(k.startsWith('guide_')).toBe(true);
    }
  });

  it('무거운 블록키는 전부 등록된 블록키다', () => {
    for (const k of HEAVY_BLOCK_KEYS) {
      expect(isGuideDataBlockKey(k)).toBe(true);
      expect(GUIDE_DATA_BLOCK_KEYS).toContain(k);
    }
  });
});

/**
 * 값 자체는 운영 규모 데이터에 기대므로 검증할 수 없다. 테스트는 계약만 본다 —
 * 빈 DB에서 던지지 않고, 형태가 맞고, 표시용 상수가 흐트러지지 않았는지.
 */
describe('무거운 블록 집계 계약', () => {
  it('area-price: 빈 데이터에서도 배열을 돌려준다', async () => {
    const r = await computeAreaPrice();
    expect(Array.isArray(r.rows)).toBe(true);
    for (const row of r.rows) {
      expect(typeof row.band).toBe('string');
      expect(Number.isFinite(row.manwonPerPyeong)).toBe(true);
    }
  });

  it('price-trend: 진행 중인 당월은 포함하지 않는다', async () => {
    const r = await computePriceTrend();
    expect(Array.isArray(r.points)).toBe(true);
    const thisMonth = new Date().toISOString().slice(0, 7);
    expect(r.points.map((p) => p.month)).not.toContain(thisMonth);
  });

  it('floor-premium: 채택 조합 수가 전체 조합 수를 넘지 않는다', async () => {
    const r = await computeFloorPremium();
    expect(r.groupsUsed).toBeLessThanOrEqual(r.groups);
    expect(Number.isFinite(r.medianPctPerFloor)).toBe(true);
  });

  it('subway-premium: 도보권 반경은 nearby와 같은 800m다', async () => {
    expect(WALK_RADIUS_METERS).toBe(800);
    const r = await computeSubwayPremium();
    expect(r.walkRadiusMeters).toBe(800);
    expect(r.noPremiumSigungus).toBeLessThanOrEqual(r.sigungus);
  });

  it('ltv-by-region: 예시 비율은 40·50·70이고 규제값이 아니다', async () => {
    expect([...EXAMPLE_LTV_PCT]).toEqual([40, 50, 70]);
    const r = await computeLtvByRegion();
    expect(r.exampleLtvPct).toEqual([40, 50, 70]);
    expect(Array.isArray(r.rows)).toBe(true);
  });
});
