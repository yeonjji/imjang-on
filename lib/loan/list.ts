import { prisma } from '@/lib/db';

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
export interface LoanFacets {
  usage: FacetCount[];
  inst: FacetCount[];
  region: FacetCount[];
  target: FacetCount[];
}
export interface LoanFilterCriteria {
  usage: string[];
  inst: string[];
  region: string[];
  target: string[];
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

export function collectFacets(rows: LoanSummary[]): LoanFacets {
  return {
    usage: countTags(rows, (r) => r.usageTags),
    target: countTags(rows, (r) => r.targetTags),
    region: countTags(rows, (r) => r.regionTags),
    inst: countTags(rows, (r) => (r.instCtg ? [r.instCtg] : [])),
  };
}

// 같은 패세트 내 OR, 패세트 간 AND.
function matchesAny(selected: string[], values: string[]): boolean {
  return selected.length === 0 || selected.some((s) => values.includes(s));
}

export function filterLoans(rows: LoanSummary[], c: LoanFilterCriteria): LoanSummary[] {
  const q = c.query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      matchesAny(c.usage, r.usageTags) &&
      matchesAny(c.target, r.targetTags) &&
      matchesAny(c.region, r.regionTags) &&
      matchesAny(c.inst, r.instCtg ? [r.instCtg] : []) &&
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
