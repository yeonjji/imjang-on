import { describe, it, expect } from 'vitest';
import { findForbiddenGuidePhrases, runGuideGuardrails } from '@/lib/guide/guardrails';

describe('guide guardrails', () => {
  it('투자권유·시세 단정전망·과장 표현을 잡는다', () => {
    expect(findForbiddenGuidePhrases('지금이 기회입니다')).toContain('투자권유');
    expect(findForbiddenGuidePhrases('집값이 오를 것입니다')).toContain('시세 단정 전망');
    expect(findForbiddenGuidePhrases('무조건 이득입니다')).toContain('과장');
  });
  it('해설·하우투 표현은 통과시킨다(빈 배열)', () => {
    const ok = '전세가율은 전세보증금을 매매가로 나눈 값입니다. 계약 전 등기부등본을 확인하세요. 일반적으로 가점은 무주택 기간으로 산정됩니다.';
    expect(findForbiddenGuidePhrases(ok)).toEqual([]);
  });
  it('출처 누락을 위반으로 잡는다', () => {
    const r = runGuideGuardrails({ body: '가'.repeat(900), sourceName: '', sourceUrl: '' });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('출처'))).toBe(true);
  });
  it('FINANCE 가이드의 정당한 "보증금을 보장합니다"는 통과(오탐 방지)', () => {
    expect(findForbiddenGuidePhrases('전세보증금 반환을 보장합니다')).toEqual([]);
  });
  it('"무조건"이 일반 조언 강조어일 땐 통과(오탐 방지)', () => {
    expect(findForbiddenGuidePhrases('계약 전 무조건 등기부등본을 확인하세요')).toEqual([]);
  });
  it('추가된 고가치 금지표현을 잡는다', () => {
    expect(findForbiddenGuidePhrases('급등이 예상됩니다')).toContain('시세 단정 전망');
    expect(findForbiddenGuidePhrases('지금 사두면 좋습니다')).toContain('투자권유');
    expect(findForbiddenGuidePhrases('수익이 보장됩니다')).toContain('과장');
  });
});
