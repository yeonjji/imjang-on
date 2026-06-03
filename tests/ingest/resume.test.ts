import { describe, it, expect } from 'vitest';
import { kstMidnightUtc } from '@/scripts/ingest/transactions/resume';

describe('kstMidnightUtc', () => {
  it('KST 오전(UTC 같은 날)의 자정을 전날 15:00 UTC로 환산', () => {
    // 2026-06-03T10:00:00Z = KST 2026-06-03 19:00 → KST 자정 = 2026-06-02T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-03T10:00:00Z')).toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });

  it('UTC가 다음날로 넘어가도 같은 KST 날짜면 동일 자정', () => {
    // 2026-06-03T14:00:00Z = KST 2026-06-03 23:00 → KST 자정 = 2026-06-02T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-03T14:00:00Z')).toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });

  it('KST 자정 직전(UTC 14:59:59)은 전 KST 날짜의 자정', () => {
    // 2026-06-02T14:59:59Z = KST 2026-06-02 23:59:59 → KST 자정 = 2026-06-01T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-02T14:59:59Z')).toISOString()).toBe('2026-06-01T15:00:00.000Z');
  });
});
