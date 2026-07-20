import { describe, it, expect } from 'vitest';
import { GuideCategory } from '@prisma/client';
import { selectGuideSeeds } from '@/lib/guide/select-seeds';
import type { GuideSeed } from '@/lib/guide/seeds';

function seed(key: string): GuideSeed {
  return {
    key,
    category: GuideCategory.LIFE,
    title: 't',
    angle: 'a',
    source: { name: 'n', url: 'https://example.gov', date: '2026-01-01', excerpt: 'e' },
    related: { label: 'l', href: '/x' },
  };
}
const seeds = [seed('a'), seed('b'), seed('c')];

describe('selectGuideSeeds', () => {
  it('미지정(undefined/빈문자열)이면 전체 반환', () => {
    expect(selectGuideSeeds(undefined, seeds)).toHaveLength(3);
    expect(selectGuideSeeds('', seeds)).toHaveLength(3);
  });
  it('단일 key면 해당 시드만', () => {
    expect(selectGuideSeeds('b', seeds).map((s) => s.key)).toEqual(['b']);
  });
  it('CSV면 지정 key만(주변 공백 트림)', () => {
    expect(selectGuideSeeds('a, c', seeds).map((s) => s.key)).toEqual(['a', 'c']);
  });
  it('매칭 없는 key면 빈 배열', () => {
    expect(selectGuideSeeds('zzz', seeds)).toEqual([]);
  });
});
