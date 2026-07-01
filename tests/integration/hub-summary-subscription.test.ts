import { describe, it, expect } from 'vitest';
import { getSubscriptionHubSummary } from '@/lib/hub-summary/subscription';

describe('getSubscriptionHubSummary', () => {
  it('전국 청약: total>0면 정체 문장 대상', async () => {
    const d = await getSubscriptionHubSummary();
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
    expect(d.scopeLevel).toBe('nation');
  });

  it('DB에 데이터 있으면 unit은 "건"', async () => {
    const d = await getSubscriptionHubSummary();
    if (d === null) return;
    expect(d.unit).toBe('건');
  });
});
