import { describe, it, expect } from 'vitest';
import { composeDetailFaq } from '@/lib/faq/compose';
import { FAQ } from '@/lib/faq/data';

const dyn = (n: number) => Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));

describe('composeDetailFaq', () => {
  it('페이지별 문항이 2개 미만이면 null', () => {
    expect(composeDetailFaq(dyn(0))).toBeNull();
    expect(composeDetailFaq(dyn(1))).toBeNull();
  });

  it('공통 문항(FAQ[category])을 붙이지 않는다 — 수만 페이지 같은 문장 방지', () => {
    const out = composeDetailFaq(dyn(2));
    expect(out).toEqual(dyn(2));
    const generic = new Set(Object.values(FAQ).flat().map((i) => i.q));
    expect(out!.some((i) => generic.has(i.q))).toBe(false);
  });

  it('null 항목은 건너뛴다', () => {
    expect(composeDetailFaq([...dyn(1), null, { q: 'x', a: 'y' }])).toEqual([...dyn(1), { q: 'x', a: 'y' }]);
  });

  it('minDynamic 지정', () => {
    expect(composeDetailFaq(dyn(2), 3)).toBeNull();
    expect(composeDetailFaq(dyn(3), 3)).not.toBeNull();
  });
});
