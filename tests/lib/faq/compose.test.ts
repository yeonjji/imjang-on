import { describe, it, expect } from 'vitest';
import { composeDetailFaq } from '@/lib/faq/compose';
import { FAQ } from '@/lib/faq/data';

const dyn = (n: number) => Array.from({ length: n }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));

describe('composeDetailFaq', () => {
  it('returns null when dynamic items are fewer than minDynamic (default 2)', () => {
    expect(composeDetailFaq(dyn(0), 'apt')).toBeNull();
    expect(composeDetailFaq(dyn(1), 'apt')).toBeNull();
  });

  it('merges dynamic items BEFORE the category generic bank when >= minDynamic', () => {
    const out = composeDetailFaq(dyn(2), 'apt');
    expect(out).not.toBeNull();
    expect(out!.slice(0, 2)).toEqual(dyn(2));
    expect(out!.slice(2)).toEqual(FAQ.apt);
  });

  it('respects a custom minDynamic', () => {
    expect(composeDetailFaq(dyn(2), 'apt', 3)).toBeNull();
    expect(composeDetailFaq(dyn(3), 'apt', 3)).not.toBeNull();
  });
});
