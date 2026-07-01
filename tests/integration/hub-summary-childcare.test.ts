import { describe, it, expect } from 'vitest';
import { getChildcareHubSummary } from '@/lib/hub-summary/childcare';

describe('getChildcareHubSummary', () => {
  it('전국: nation 스코프, 하이라이트에 운영유형/정원', async () => {
    const d = await getChildcareHubSummary();
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
  });
});
