import { describe, it, expect } from 'vitest';
import { kstMidnightUtc, doneRunFilter, buildDoneKeys } from '@/scripts/ingest/transactions/resume';

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

  it('KST 자정 정각(UTC 15:00:00)은 그 날 자정 그대로', () => {
    expect(kstMidnightUtc(new Date('2026-06-02T15:00:00Z')).toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });
});

describe('doneRunFilter', () => {
  it('daily 모드는 오늘(KST) 자정 이후 완료분만 조회하도록 finishedAt 하한 반환', () => {
    const now = new Date('2026-06-03T10:00:00Z');
    expect(doneRunFilter('daily', now)).toEqual({ finishedAt: { gte: new Date('2026-06-02T15:00:00Z') } });
  });

  it('backfill 모드는 날짜 제한 없음(빈 객체)', () => {
    expect(doneRunFilter('backfill', new Date('2026-06-03T10:00:00Z'))).toEqual({});
  });
});

describe('buildDoneKeys', () => {
  it('source:targetKey 형태의 Set 생성', () => {
    const keys = buildDoneKeys([
      { source: 'apt-trade', targetKey: '11650-202606' },
      { source: 'apt-rent', targetKey: '11650-202605' },
    ]);
    expect(keys.has('apt-trade:11650-202606')).toBe(true);
    expect(keys.has('apt-rent:11650-202605')).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('중복 source:targetKey는 하나로 축약', () => {
    const keys = buildDoneKeys([
      { source: 'apt-trade', targetKey: '11650-202606' },
      { source: 'apt-trade', targetKey: '11650-202606' },
    ]);
    expect(keys.size).toBe(1);
  });
});
