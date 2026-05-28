import { LIFE_GROUPS, type LifeGroup, type LifeSubItem } from '@/app/(public)/_components/life-menu';

export interface SiblingTabsResult {
  group: LifeGroup;
  items: LifeSubItem[];
  activeLabel: string;
}

/**
 * 주어진 `currentHref`가 LIFE_GROUPS에 등록된 하위 항목 href와 정확히 일치하면
 * 그 그룹의 형제 탭 정보를 돌려준다. 매칭 실패 시 null (탭 미마운트).
 *
 * - 정확 일치 비교: '/amenity/convenience?sido=서울' 같은 쿼리 포함 href는 의도적으로 매칭 안 됨.
 *   호출부(LIST 페이지)는 경로 부분만 넘긴다.
 */
export function getSiblingTabs(currentHref: string): SiblingTabsResult | null {
  for (const group of LIFE_GROUPS) {
    const hit = group.items.find((it) => it.href === currentHref);
    if (hit) {
      return { group, items: group.items, activeLabel: hit.label };
    }
  }
  return null;
}
