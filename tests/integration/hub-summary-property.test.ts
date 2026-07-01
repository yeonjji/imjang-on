import { describe, it, expect } from 'vitest';
import { PropertyType } from '@prisma/client';
import { getPropertyHubStats } from '@/lib/hub-summary/property';

describe('getPropertyHubStats', () => {
  it('오피스텔: nation 스코프 + 시도 분포', async () => {
    const d = await getPropertyHubStats([PropertyType.OFFICETEL], '오피스텔');
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.kind).toBe('property');
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('빌라: 두 개 타입 합산', async () => {
    const d = await getPropertyHubStats([PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX], '연립·다세대');
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
  });

  it('오피스텔: 거래유형 하이라이트', async () => {
    const d = await getPropertyHubStats([PropertyType.OFFICETEL], '오피스텔');
    if (d === null || !d.highlights) return;
    expect(d.highlights.join(' ')).toContain('매매');
  });
});
