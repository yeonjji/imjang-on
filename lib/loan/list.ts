import { prisma } from '@/lib/db';
import {
  USAGE_CATEGORIES,
  INST_CATEGORIES,
  TARGET_CATEGORIES,
  usageSlugs,
  instSlug,
  targetSlugs,
  type CategoryDef,
} from './categories';

export interface LoanSummary {
  seq: number;
  finprdnm: string;
  ofrinstnm: string | null;
  instCtg: string | null;
  lnlmt: number | null;
  irt: string | null;
  usageTags: string[];
  targetTags: string[];
  regionTags: string[];
}

export interface FacetCount {
  value: string;
  count: number;
}
/** 우리 카테고리 facet(탭용): 슬러그·라벨·상품수 */
export interface CategoryFacet {
  slug: string;
  label: string;
  count: number;
}
export interface LoanFacets {
  usage: CategoryFacet[];
  inst: CategoryFacet[];
  target: CategoryFacet[];
  region: FacetCount[]; // 지역은 시도 셀렉트(원본값 유지)
}
/** 탭은 차원별 단일선택(전체=null), 차원 간 AND. 지역은 시도 단일값. */
export interface LoanFilterCriteria {
  usage: string | null; // 카테고리 슬러그
  inst: string | null;
  target: string | null;
  region: string | null; // 시도값
  query: string;
  sort: 'limitDesc' | 'limitAsc' | null;
}

function countTags(rows: LoanSummary[], pick: (r: LoanSummary) => string[]): FacetCount[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of pick(r)) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'),
  );
}

// 카테고리 def 순서를 유지하되 상품수 0인 카테고리는 제외.
function categoryFacet(
  rows: LoanSummary[],
  defs: CategoryDef[],
  slugsOf: (r: LoanSummary) => string[],
): CategoryFacet[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const s of slugsOf(r)) m.set(s, (m.get(s) ?? 0) + 1);
  return defs
    .filter((d) => m.has(d.slug))
    .map((d) => ({ slug: d.slug, label: d.label, count: m.get(d.slug)! }));
}

export function collectFacets(rows: LoanSummary[]): LoanFacets {
  return {
    usage: categoryFacet(rows, USAGE_CATEGORIES, (r) => usageSlugs(r.usageTags)),
    inst: categoryFacet(rows, INST_CATEGORIES, (r) => {
      const s = instSlug(r.instCtg);
      return s ? [s] : [];
    }),
    target: categoryFacet(rows, TARGET_CATEGORIES, (r) => targetSlugs(r.targetTags)),
    region: countTags(rows, (r) => r.regionTags),
  };
}

export function filterLoans(rows: LoanSummary[], c: LoanFilterCriteria): LoanSummary[] {
  const q = c.query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (c.usage === null || usageSlugs(r.usageTags).includes(c.usage)) &&
      (c.inst === null || instSlug(r.instCtg) === c.inst) &&
      (c.target === null || targetSlugs(r.targetTags).includes(c.target)) &&
      (c.region === null || r.regionTags.includes(c.region)) &&
      (q === '' || r.finprdnm.toLowerCase().includes(q)),
  );
  if (c.sort === 'limitDesc' || c.sort === 'limitAsc') {
    const dir = c.sort === 'limitDesc' ? -1 : 1;
    filtered.sort((a, b) => ((a.lnlmt ?? 0) - (b.lnlmt ?? 0)) * dir);
  }
  return filtered;
}

export async function getLoanSummaries(): Promise<LoanSummary[]> {
  return prisma.loanProduct.findMany({
    select: {
      seq: true, finprdnm: true, ofrinstnm: true, instCtg: true,
      lnlmt: true, irt: true, usageTags: true, targetTags: true, regionTags: true,
    },
    orderBy: { finprdnm: 'asc' },
  });
}
