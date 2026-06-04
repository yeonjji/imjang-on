import { describe, it, expect } from 'vitest';
import { getHomeStats } from '@/lib/stats';

describe('getHomeStats', () => {
  it('네 카운트를 0 이상의 숫자로 반환한다', async () => {
    const s = await getHomeStats();
    for (const v of [s.transactions, s.properties, s.schools, s.lifeFacilities]) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
