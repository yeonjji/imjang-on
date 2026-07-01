import { describe, it, expect } from 'vitest';
import { getSchoolHubSummary } from '@/lib/hub-summary/school';

describe('getSchoolHubSummary', () => {
  it('전국: nation 스코프, 하이라이트에 학교급', async () => {
    const d = await getSchoolHubSummary();
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
    if (d.highlights) expect(d.highlights.join(' ')).toMatch(/학교급|공립|사립/);
  });
});
