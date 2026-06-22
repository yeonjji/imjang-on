import type { PostCategory } from '@prisma/client';

/**
 * 부동산·금융 보드에 실을 부처(기관) 화이트리스트. korea.kr 전부처 피드에서 무관 기관 제거용.
 * 2026 정부조직 개편으로 일부 명칭 변경(기획재정부→재정경제부, 통계청→국가데이터처) — 신·구 명칭 모두 등록(라이브 확인).
 */
export const AGENCY_WHITELIST = new Set<string>([
  '국토교통부', '금융위원회', '금융감독원', '한국은행', '한국부동산원', '국세청',
  '재정경제부', '기획재정부', '국가데이터처', '통계청',
]);

/**
 * 카테고리별 키워드 — 수요자/정책 중심으로 좁힘(거시 통계 노이즈 방지).
 * 관련도 판정 + 카테고리 힌트(최종 분류는 LLM). 위에서부터 우선.
 */
export const CATEGORY_KEYWORDS: { category: PostCategory; words: string[] }[] = [
  { category: 'SUBSCRIPTION', words: ['청약', '분양', '사전청약', '입주자 모집', '입주자모집', '뉴:홈', '뉴홈', '공공분양', '특별공급', '신혼희망타운'] },
  { category: 'LOAN', words: ['대출', '주담대', '주택담보', '디딤돌', '보금자리', '버팀목', '대환', '전세자금', 'LTV', 'DSR', 'DTI'] },
  { category: 'REALESTATE', words: ['부동산', '주택', '아파트', '전세', '임대', '재건축', '재개발', '매매', '분양가', '공시가격', '집값', '주거', '입주'] },
  { category: 'ECONOMY', words: ['종부세', '종합부동산세', '양도세', '양도소득세', '취득세', '재산세', '세제'] },
  { category: 'FINANCE', words: ['기준금리', '통화정책', '가계대출', '가계부채', '예금자보호', '보험료'] },
];

/**
 * 제외 키워드 — 화이트리스트 부처라도 이게 제목/본문에 있으면 보드 부적합으로 컷.
 * 인사·정기 거시통계·시장 동향 보고 등 수요자 무관 자료(특히 한국은행 정례물) 제거.
 */
export const EXCLUDE_KEYWORDS = [
  '인사', '임명', '취임', '내정', '보직',
  '지수', '국민계정', '국민소득', '경상수지', '국제수지', '자금순환',
  '사용실적', '산업별 대출금', '예금취급기관', '무역수지', '통화 및 유동성',
  '가중평균금리', // 수치 나열형 통계 — LLM이 1,000자 기사로 못 키워 매일 reject됨
];

/** 생성 가치가 있는 최소 본문 길이(공백 포함 문자수). 이보다 짧으면 1,200자 기사로 못 키워 가드레일 reject → 사전 제외. */
export const MIN_SOURCE_CHARS = 1000;

export function matchedKeywords(text: string): string[] {
  const hits: string[] = [];
  for (const g of CATEGORY_KEYWORDS) {
    for (const w of g.words) if (text.includes(w)) hits.push(w);
  }
  return hits;
}

export function isExcluded(text: string): boolean {
  return EXCLUDE_KEYWORDS.some((w) => text.includes(w));
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

/** 부처 화이트리스트 ∧ 키워드 매칭 ∧ 제외어 없음. (주제 적합성만 판정 — 길이 필터는 runner에서 별도) */
export function isRelevant(item: RelevanceInput): boolean {
  if (!item.agency || !AGENCY_WHITELIST.has(item.agency)) return false;
  const text = `${item.title}\n${item.bodyText}`;
  if (isExcluded(text)) return false;
  return matchedKeywords(text).length > 0;
}
