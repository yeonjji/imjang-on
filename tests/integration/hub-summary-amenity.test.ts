import { describe, it, expect } from 'vitest';
import { getAmenityHubSummary } from '@/lib/hub-summary/amenity';

describe('getAmenityHubSummary', () => {
  it('서울 카페: sido 스코프 + 시군구 분포', async () => {
    const d = await getAmenityHubSummary('cafe', '카페', { sido: '서울' }, '서울');
    if (d === null) return;
    expect(d.scopeLevel).toBe('sido');
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    d.topRegions.forEach((r) => expect(r.name).not.toMatch(/^\d/)); // 코드가 아닌 지역명
  });
});
