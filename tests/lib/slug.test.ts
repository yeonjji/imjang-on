import { describe, it, expect } from 'vitest';
import { normalizeName } from '@/lib/slug';

describe('normalizeName', () => {
  it.each([
    ['래미안서초에스티지', '래미안서초에스티지'],
    ['래미안 서초 에스티지', '래미안서초에스티지'],
    ['래미안-서초·에스티지', '래미안서초에스티지'],
    ['  공백  ', '공백'],
    ['SK뷰', 'sk뷰'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
