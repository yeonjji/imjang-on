import { describe, it, expect } from 'vitest';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

describe('dedupeKey', () => {
  it('같은 URL은 같은 키, 다른 URL은 다른 키', () => {
    const a = dedupeKey('https://x/1');
    expect(a).toBe(dedupeKey('https://x/1'));
    expect(a).not.toBe(dedupeKey('https://x/2'));
    expect(a).toHaveLength(64); // sha256 hex
  });
});

describe('kstDateISO', () => {
  it('GMT 자정 직전을 KST 다음날로 환산', () => {
    // 2026-06-15T16:00:00Z = KST 2026-06-16 01:00 → 06-16
    expect(kstDateISO(new Date('2026-06-15T16:00:00Z'))).toBe('2026-06-16');
  });
  it('GMT 오전은 같은 날 KST', () => {
    expect(kstDateISO(new Date('2026-06-15T01:00:00Z'))).toBe('2026-06-15');
  });
});
