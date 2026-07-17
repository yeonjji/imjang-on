import { FAQ, type FaqCategory, type FaqItem } from '@/lib/faq/data';

/**
 * 상세페이지 FAQ 조립기(가드레일).
 * 페이지-치환 동적 Q&A가 minDynamic개 이상일 때만 [동적 + 카테고리 generic]을 반환한다.
 * 미만이면 null → 페이지는 FAQ 블록을 생략한다(정적 복붙으로 thin near-duplicate를 만들지 않는다).
 */
export function composeDetailFaq(
  dynamic: FaqItem[],
  category: FaqCategory,
  minDynamic = 2,
): FaqItem[] | null {
  if (dynamic.length < minDynamic) return null;
  return [...dynamic, ...(FAQ[category] ?? [])];
}
