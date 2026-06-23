import { describe, it, expect } from 'vitest';
import { manualSlug, manualDedupeKey, kstDateISO } from '@/lib/board/manual-draft';

describe('manualSlug', () => {
  it('공백·문장부호 제거, 소문자화(normalizeName)', () => {
    expect(manualSlug('전세 사기 예방')).toBe('전세사기예방');
  });
  it('40자 컷', () => {
    expect(manualSlug('가'.repeat(60)).length).toBe(40);
  });
});

describe('manualDedupeKey', () => {
  it('manual:{slug}:{date} 형식, 표기 흔들림 무관', () => {
    expect(manualDedupeKey('전세 사기', '2026-06-23')).toBe('manual:전세사기:2026-06-23');
    expect(manualDedupeKey('전세사기', '2026-06-23')).toBe('manual:전세사기:2026-06-23');
  });
});

describe('kstDateISO', () => {
  it('UTC 자정 직후도 KST 기준 같은 날(+9h)', () => {
    // 2026-06-22T20:00:00Z → KST 2026-06-23 05:00
    expect(kstDateISO(new Date('2026-06-22T20:00:00Z'))).toBe('2026-06-23');
  });
});
