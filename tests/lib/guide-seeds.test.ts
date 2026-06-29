import { describe, it, expect } from 'vitest';
import { GUIDE_SEEDS, validateGuideSeeds } from '@/lib/guide/seeds';
import { GuideCategory } from '@prisma/client';

describe('guide seeds', () => {
  it('시드 키가 고유하고 모든 카테고리를 최소 1개 덮는다', () => {
    expect(validateGuideSeeds()).toEqual({ ok: true, errors: [] });
  });
  it('각 시드는 카테고리·주제·출처를 갖는다', () => {
    for (const s of GUIDE_SEEDS) {
      expect(Object.values(GuideCategory)).toContain(s.category);
      expect(s.key.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.source.name.length).toBeGreaterThan(0);
      expect(s.source.url).toMatch(/^https?:\/\//);
    }
  });
});
