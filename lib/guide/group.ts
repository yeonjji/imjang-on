import type { GuideCategory } from '@prisma/client';
import type { GuideListItem } from '@/lib/guide/queries';
import { GUIDE_CATEGORIES, guideCategoryLabel } from '@/lib/guide/labels';

export interface GuideCategorySection {
  category: GuideCategory;
  label: string;
  items: GuideListItem[];
}

/** GUIDE_CATEGORIES 순서로 묶는다. 항목 없는 카테고리는 제외(순수). */
export function groupGuidesByCategory(rows: GuideListItem[]): GuideCategorySection[] {
  return GUIDE_CATEGORIES.map(({ value }) => ({
    category: value,
    label: guideCategoryLabel(value),
    items: rows.filter((r) => r.category === value),
  })).filter((s) => s.items.length > 0);
}
