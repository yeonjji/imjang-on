import { describe, it, expect } from 'vitest';
import { walkMinutes } from '@/lib/walk-minutes';

describe('walkMinutes (80 m/분 통일)', () => {
  it('80m/분으로 반올림', () => {
    expect(walkMinutes(1360)).toBe(17); // 1360/80 = 17.0
    expect(walkMinutes(800)).toBe(10);
  });
  it('하한 1분', () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(30)).toBe(1);
  });
  it('반올림 경계', () => {
    expect(walkMinutes(120)).toBe(2); // 1.5 → 2
    expect(walkMinutes(119)).toBe(1); // 1.4875 → 1
  });
});
