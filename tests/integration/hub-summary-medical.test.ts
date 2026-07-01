import { describe, it, expect } from 'vitest';
import { getMedicalRegionBreakdown } from '@/lib/hub-summary/medical';

describe('getMedicalRegionBreakdown', () => {
  it('전국 병원: nation 스코프 + 상위3 + 비중', async () => {
    const d = await getMedicalRegionBreakdown('hospital', '병원·의원');
    if (d === null) return; // 로컬 DB에 의료 데이터 없으면 스킵(폴백 검증은 유닛에서)
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
    expect(d.topRegions.length).toBeGreaterThan(0);
    expect(d.topRegions.length).toBeLessThanOrEqual(3);
    if (d.concentrationPct != null) {
      expect(d.concentrationPct).toBeGreaterThanOrEqual(0);
      expect(d.concentrationPct).toBeLessThanOrEqual(100);
    }
    // topRegions는 count 내림차순
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
