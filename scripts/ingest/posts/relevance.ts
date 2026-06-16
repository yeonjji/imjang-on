import type { PostCategory } from '@prisma/client';

/**
 * 부동산·금융 보드에 실을 부처(기관) 화이트리스트. korea.kr 전부처 피드에서 무관 기관 제거용.
 * 2026 정부조직 개편으로 일부 명칭 변경(기획재정부→재정경제부, 통계청→국가데이터처) — 신·구 명칭 모두 등록(라이브 확인).
 */
export const AGENCY_WHITELIST = new Set<string>([
  '국토교통부', '금융위원회', '금융감독원', '한국은행', '한국부동산원', '국세청',
  '재정경제부', '기획재정부', '국가데이터처', '통계청',
]);

/** 카테고리별 키워드. 관련도 판정 + 카테고리 힌트(최종 분류는 LLM). 위에서부터 우선. */
export const CATEGORY_KEYWORDS: { category: PostCategory; words: string[] }[] = [
  { category: 'SUBSCRIPTION', words: ['청약', '분양', '사전청약', '입주자 모집', '입주자모집', '뉴:홈', '뉴홈', '공공분양', '특별공급'] },
  { category: 'LOAN', words: ['대출', '주담대', '주택담보', '디딤돌', '보금자리', '버팀목', '대환', 'LTV', 'DSR', 'DTI', '금리'] },
  { category: 'REALESTATE', words: ['부동산', '주택', '아파트', '전세', '임대', '재건축', '재개발', '매매', '분양가', '공시가격', '집값', '주거'] },
  { category: 'ECONOMY', words: ['종부세', '종합부동산세', '양도세', '양도소득세', '취득세', '재산세', '세제', '세율', '물가', '경기', '고용', '소득'] },
  { category: 'FINANCE', words: ['금융', '은행', '예금', '적금', '보험', '카드', '통화정책', '기준금리'] },
];

export function matchedKeywords(text: string): string[] {
  const hits: string[] = [];
  for (const g of CATEGORY_KEYWORDS) {
    for (const w of g.words) if (text.includes(w)) hits.push(w);
  }
  return hits;
}

/** 최초로 매칭되는 카테고리(우선순위 순). 없으면 null. 로깅·참고용이며 최종 분류는 LLM. */
export function categoryHint(text: string): PostCategory | null {
  for (const g of CATEGORY_KEYWORDS) {
    if (g.words.some((w) => text.includes(w))) return g.category;
  }
  return null;
}

export interface RelevanceInput {
  agency: string | null;
  title: string;
  bodyText: string;
}

/** 부처 화이트리스트 ∧ 키워드 매칭. 둘 다 충족해야 부동산·금융 후보로 인정. */
export function isRelevant(item: RelevanceInput): boolean {
  if (!item.agency || !AGENCY_WHITELIST.has(item.agency)) return false;
  return matchedKeywords(`${item.title}\n${item.bodyText}`).length > 0;
}
