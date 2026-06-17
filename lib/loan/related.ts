import {
  USAGE_CATEGORIES,
  TARGET_CATEGORIES,
  usageSlugs,
  targetSlugs,
  type CategoryDef,
} from './categories';
import type { LoanSummary } from './list';

export const MAX_RELATED = 4;

export interface RelatedLoanReason {
  kind: 'usage' | 'target' | 'region';
  label: string;
}

export interface RelatedLoan extends LoanSummary {
  reasons: RelatedLoanReason[];
  summaryLine: string;
}

function labelOf(slug: string, defs: CategoryDef[]): string {
  return defs.find((d) => d.slug === slug)?.label ?? slug;
}

// targetSlugs는 미분류 시 'etc'로 폴백한다. 'etc'는 의미 있는 공통점이 아니므로 매칭에서 뺀다.
function meaningfulTargetSlugs(tags: string[]): string[] {
  return targetSlugs(tags).filter((s) => s !== 'etc');
}

function intersect(values: string[], set: Set<string>): string[] {
  return values.filter((v) => set.has(v));
}

function summaryLineFor(item: LoanSummary): string {
  const usageLabels = usageSlugs(item.usageTags).map((s) => labelOf(s, USAGE_CATEGORIES));
  const targetLabels = meaningfulTargetSlugs(item.targetTags).map((s) =>
    labelOf(s, TARGET_CATEGORIES),
  );
  const parts: string[] = [];
  if (usageLabels.length) parts.push(usageLabels.join('·'));
  if (targetLabels.length) parts.push(`${targetLabels.join('·')} 대상`);
  return parts.length ? parts.join(' · ') : (item.ofrinstnm ?? '서민금융 대출상품');
}

export function recommendLoans(
  current: LoanSummary,
  all: LoanSummary[],
  max: number = MAX_RELATED,
): RelatedLoan[] {
  const pUsage = new Set(usageSlugs(current.usageTags));
  const pTarget = new Set(meaningfulTargetSlugs(current.targetTags));
  const pRegion = new Set(current.regionTags);

  interface Scored {
    item: LoanSummary;
    score: number;
    lnlmtDelta: number;
    reasons: RelatedLoanReason[];
  }
  const scored: Scored[] = [];

  for (const c of all) {
    if (c.seq === current.seq) continue;

    const sharedUsage = intersect(usageSlugs(c.usageTags), pUsage);
    const sharedTarget = intersect(meaningfulTargetSlugs(c.targetTags), pTarget);
    if (sharedUsage.length + sharedTarget.length < 1) continue;

    const sharedRegion = c.regionTags.some((r) => pRegion.has(r));
    const score = 2 * sharedUsage.length + 2 * sharedTarget.length + (sharedRegion ? 1 : 0);
    const lnlmtDelta =
      current.lnlmt != null && c.lnlmt != null
        ? Math.abs(current.lnlmt - c.lnlmt)
        : Number.POSITIVE_INFINITY;

    const reasons: RelatedLoanReason[] = [
      ...sharedUsage.map(
        (s): RelatedLoanReason => ({ kind: 'usage', label: `같은 목적·${labelOf(s, USAGE_CATEGORIES)}` }),
      ),
      ...sharedTarget.map(
        (s): RelatedLoanReason => ({ kind: 'target', label: `같은 대상·${labelOf(s, TARGET_CATEGORIES)}` }),
      ),
      ...(sharedRegion ? [{ kind: 'region', label: '같은 지역' } as RelatedLoanReason] : []),
    ].slice(0, 2);

    scored.push({ item: c, score, lnlmtDelta, reasons });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.lnlmtDelta - b.lnlmtDelta ||
      a.item.finprdnm.localeCompare(b.item.finprdnm, 'ko'),
  );

  return scored.slice(0, max).map((s) => ({
    ...s.item,
    reasons: s.reasons,
    summaryLine: summaryLineFor(s.item),
  }));
}
