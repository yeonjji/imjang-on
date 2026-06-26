import { describe, it, expect } from 'vitest';
import { findForbiddenPhrases, checkLength, runGuardrails } from '@/lib/board/guardrails';

describe('findForbiddenPhrases', () => {
  it('의견·전망성 표현을 잡아낸다', () => {
    expect(findForbiddenPhrases('상승할 것으로 보입니다.')).toContain('보입니다');
    expect(findForbiddenPhrases('하락 가능성이 있습니다.').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('오를 것으로 예상됩니다.').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('전문가 추천합니다.').length).toBeGreaterThan(0);
  });
  it('중립적 사실 서술은 통과한다', () => {
    expect(findForbiddenPhrases('국토교통부는 6월 12일 한도를 상향했다고 발표했다.')).toEqual([]);
  });
});
describe('checkLength', () => {
  it('하한(800) 이상이면 ok', () => { expect(checkLength('가'.repeat(900)).ok).toBe(true); });
  it('너무 짧으면(800 미만) 실패', () => { expect(checkLength('가'.repeat(700)).ok).toBe(false); });
});
describe('runGuardrails', () => {
  it('출처 누락이면 위반', () => {
    const r = runGuardrails({ body: '가'.repeat(1600), sourceName: '', sourceUrl: 'https://x' });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('출처'))).toBe(true);
  });
  it('금지표현 있으면 위반', () => {
    const r = runGuardrails({ body: '가'.repeat(1600) + ' 상승할 것으로 보입니다.', sourceName: '국토부', sourceUrl: 'https://x' });
    expect(r.ok).toBe(false);
  });
  it('정상 글은 통과', () => {
    const r = runGuardrails({ body: '국토교통부는 한도를 상향했다고 발표했다. '.repeat(80), sourceName: '국토부', sourceUrl: 'https://x' });
    expect(r.ok).toBe(true);
  });
});
