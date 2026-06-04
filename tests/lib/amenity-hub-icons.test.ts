import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import { GROUP_ICONS, ITEM_ICONS } from '@/app/(public)/_components/amenity-hub';

describe('amenity-hub 아이콘 매핑', () => {
  it('모든 그룹 slug에 아이콘이 매핑된다', () => {
    for (const group of LIFE_GROUPS) {
      expect(GROUP_ICONS[group.slug], `그룹 아이콘 누락: ${group.slug}`).toBeTruthy();
    }
  });

  it('모든 항목 label에 아이콘이 매핑된다 (폴백에 의존하지 않음)', () => {
    for (const group of LIFE_GROUPS) {
      for (const item of group.items) {
        expect(ITEM_ICONS[item.label], `항목 아이콘 누락: ${item.label}`).toBeTruthy();
      }
    }
  });
});
