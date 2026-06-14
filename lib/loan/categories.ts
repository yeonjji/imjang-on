// 서민금융 원본 태그(자금용도·기관·대상)는 값이 많고 표기가 들쭉날쭉해(예: '운영·시설'/'운영ㆍ시설')
// 그대로 필터로 쓰기 어렵다. 우리 기준 ≤5개 카테고리로 묶어 탭 필터로 노출한다.
// 분류는 키워드 부분일치(첫 매칭 우선). 표기 변형은 부분일치로 자연히 흡수된다.

export interface CategoryDef {
  slug: string;
  label: string;
  keywords: string[];
}

export const USAGE_CATEGORIES: CategoryDef[] = [
  { slug: 'biz', label: '창업·운영', keywords: ['창업', '운영', '운전', '시설'] },
  { slug: 'house', label: '주거·전월세', keywords: ['주거', '전월세', '전세', '월세', '보증금'] },
  { slug: 'edu', label: '학자금', keywords: ['학자금'] },
  { slug: 'refi', label: '대환·전환', keywords: ['대환', '저금리', '전환'] },
  { slug: 'living', label: '생활안정', keywords: ['생계', '생활', '의료', '장제', '재해', '기타'] },
];

export const INST_CATEGORIES: CategoryDef[] = [
  { slug: 'gov', label: '정부·공공', keywords: ['공공', '준정부', '기금', '정부'] },
  { slug: 'local', label: '지자체', keywords: ['지자체', '지방자치'] },
  { slug: 'bank', label: '은행·금융', keywords: ['은행', '상호금융'] },
  { slug: 'foundation', label: '재단·법인', keywords: ['재단', '사단', '신용회복', '위원회', '법인'] },
  { slug: 'private', label: '민간', keywords: ['민간', '기업'] },
];

export const TARGET_CATEGORIES: CategoryDef[] = [
  { slug: 'youth', label: '청년·대학생', keywords: ['청년', '대학', '학생', '학부생', '대학원', '석사'] },
  { slug: 'biz', label: '소상공인·자영업', keywords: ['소상공인', '자영업', '사업자', '소기업', '중소기업', '기업', '벤처', '상공인', '조선'] },
  { slug: 'worker', label: '근로자·연금', keywords: ['근로자', '직장', '연금', '노령', '문화예술', '취업', '산재', '초년생'] },
  { slug: 'vuln', label: '금융취약·채무조정', keywords: ['취약', '채무', '회생', '서민', '저소득', '무주택', '주거취약', '장애', '수급', '미소금융', '햇살론', '기초생활', '신용'] },
  { slug: 'etc', label: '기타', keywords: [] }, // 위 어디에도 안 걸리면 여기로
];

function classifyOne(raw: string, defs: CategoryDef[], fallback: string | null): string | null {
  for (const d of defs) {
    if (d.keywords.some((k) => raw.includes(k))) return d.slug;
  }
  return fallback;
}

function slugsOf(tags: string[], defs: CategoryDef[], fallback: string | null): string[] {
  const set = new Set<string>();
  for (const t of tags) {
    const s = classifyOne(t, defs, fallback);
    if (s) set.add(s);
  }
  return [...set];
}

export function usageSlugs(tags: string[]): string[] {
  return slugsOf(tags, USAGE_CATEGORIES, null);
}

export function targetSlugs(tags: string[]): string[] {
  return slugsOf(tags, TARGET_CATEGORIES, 'etc');
}

export function instSlug(instCtg: string | null): string | null {
  return instCtg ? classifyOne(instCtg, INST_CATEGORIES, null) : null;
}
