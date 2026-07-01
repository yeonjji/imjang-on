import { describe, it, expect } from 'vitest';
import { getUrbanHubSummary } from '@/lib/hub-summary/urban';

describe('getUrbanHubSummary', () => {
  it('서울 주차장: null 아니면 total>0, count 내림차순', async () => {
    const d = await getUrbanHubSummary('parking', '주차장', { sido: '서울' }, '서울');
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('공원/충전소: 하이라이트가 있으면 문자열', async () => {
    const d = await getUrbanHubSummary('park', '공원', { sido: '서울' }, '서울');
    if (d === null || !d.highlights) return;
    expect(Array.isArray(d.highlights)).toBe(true);
    expect(d.highlights.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });
});
