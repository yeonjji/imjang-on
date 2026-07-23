import { describe, it, expect } from 'vitest';
import { shouldAbolish, abolishedDate } from '@/scripts/ingest/regions/abolition';

// 재시드 시 원본이 폐지 코드를 반환하지 않으므로, 이번 시드에서 sourceVersion이
// 갱신되지 않은(=API에 없는) 활성 코드를 폐지된 행정구역으로 검출한다.
describe('shouldAbolish (폐지 검출)', () => {
  it('구 버전 + 활성 → 폐지 대상', () => {
    expect(shouldAbolish({ sourceVersion: '2026-05', isAbolished: false }, '2026-07')).toBe(true);
  });

  it('현재 버전(이번 시드에서 갱신됨) → 유지', () => {
    expect(shouldAbolish({ sourceVersion: '2026-07', isAbolished: false }, '2026-07')).toBe(false);
  });

  it('이미 폐지된 코드 → 재처리 안 함(abolishedAt 덮어쓰기 방지)', () => {
    expect(shouldAbolish({ sourceVersion: '2026-05', isAbolished: true }, '2026-07')).toBe(false);
  });
});

describe('abolishedDate', () => {
  it('기본값은 sourceVersion 월의 1일', () => {
    expect(abolishedDate('2026-07').toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('override가 있으면 우선', () => {
    expect(abolishedDate('2026-07', '2026-07-15').toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('빈/공백 override는 기본값으로 폴백', () => {
    expect(abolishedDate('2026-07', '').toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(abolishedDate('2026-07', '   ').toISOString().slice(0, 10)).toBe('2026-07-01');
  });
});
