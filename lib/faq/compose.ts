import type { FaqItem } from '@/lib/faq/data';

/**
 * 상세페이지 FAQ 조립기(가드레일).
 * 페이지 값으로 만든 문항만 쓴다. 카테고리 공통 문항은 붙이지 않는다 — 수만 페이지에 같은 문장이
 * 반복되는 복제 콘텐츠가 된다(공통 문항은 /faq·허브에만). minDynamic개 미만이면 null → 블록 생략.
 */
export function composeDetailFaq(dynamic: (FaqItem | null)[], minDynamic = 2): FaqItem[] | null {
  const items = dynamic.filter((i): i is FaqItem => i !== null);
  return items.length < minDynamic ? null : items;
}
