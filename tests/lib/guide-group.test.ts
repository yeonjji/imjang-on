import { describe, it, expect } from 'vitest';
import { groupGuidesByCategory } from '@/lib/guide/group';
import { GuideCategory } from '@prisma/client';
import type { GuideListItem } from '@/lib/guide/queries';

function item(category: GuideCategory, slug: string): GuideListItem {
  return { id: 1n, slug, title: slug, summary: 's', category, publishedAt: new Date() };
}

describe('groupGuidesByCategory', () => {
  it('GUIDE_CATEGORIES 순서로 묶고, 항목 없는 카테고리는 제외한다', () => {
    const rows = [
      item(GuideCategory.LIFE, 'l1'),
      item(GuideCategory.REALESTATE, 'r1'),
      item(GuideCategory.REALESTATE, 'r2'),
    ];
    const groups = groupGuidesByCategory(rows);
    expect(groups.map((g) => g.category)).toEqual([GuideCategory.REALESTATE, GuideCategory.LIFE]);
    expect(groups[0].items.map((i) => i.slug)).toEqual(['r1', 'r2']);
    expect(groups[0].label).toBe('부동산');
  });
  it('빈 입력이면 빈 배열', () => {
    expect(groupGuidesByCategory([])).toEqual([]);
  });
});
