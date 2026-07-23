import { describe, it, expect } from 'vitest';
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
import type { Narrative } from '@/lib/insights/shared';

const nar = (fired: string[]): Narrative => ({ sentences: [], text: '', fired });

describe('isNarrativeIndexable', () => {
  it('null narrative → false', () => {
    expect(isNarrativeIndexable(null)).toBe(false);
  });
  it('fired < 3 → false (default minFired=3)', () => {
    expect(isNarrativeIndexable(nar(['a', 'b']))).toBe(false);
  });
  it('fired >= 3 → true', () => {
    expect(isNarrativeIndexable(nar(['a', 'b', 'c']))).toBe(true);
  });
  it('minFired=2 (park): fired 2 → true, 1 → false', () => {
    expect(isNarrativeIndexable(nar(['a', 'b']), 2)).toBe(true);
    expect(isNarrativeIndexable(nar(['a']), 2)).toBe(false);
  });
});

describe('robotsFor', () => {
  it('true → index+follow', () => {
    expect(robotsFor(true)).toEqual({ index: true, follow: true });
  });
  it('false → noindex+follow(항상 follow 유지)', () => {
    expect(robotsFor(false)).toEqual({ index: false, follow: true });
  });
});
