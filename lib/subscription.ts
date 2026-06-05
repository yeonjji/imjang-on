import type { SubscriptionCategory } from '@prisma/client';
import { formatBillion, formatPyeong } from '@/lib/format';

// ---- 카테고리 ----
export interface CategoryMeta {
  slug: string;
  category: SubscriptionCategory;
  label: string;
}

export const SUBSCRIPTION_CATEGORIES: CategoryMeta[] = [
  { slug: 'apt', category: 'APT', label: '아파트' },
  { slug: 'urbty', category: 'OFFICETEL_ETC', label: '오피스텔·도시형' },
  { slug: 'remndr', category: 'REMNANT', label: '무순위·잔여' },
  { slug: 'pblpvt', category: 'PUB_PRIV_RENT', label: '공공·민간임대' },
  { slug: 'opt', category: 'ARBITRARY', label: '임의공급' },
  { slug: 'lh', category: 'LH_PRESUB', label: 'LH 사전청약' },
];

const CATEGORY_BY_SLUG = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.slug, c.category]));
const LABEL_BY_CATEGORY = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.category, c.label]));

export function categoryLabel(category: SubscriptionCategory): string {
  return LABEL_BY_CATEGORY.get(category) ?? category;
}

export function slugsToCategories(slugs: string[]): SubscriptionCategory[] {
  return slugs
    .map((s) => CATEGORY_BY_SLUG.get(s))
    .filter((c): c is SubscriptionCategory => c !== undefined);
}

// ---- 상태 도출 ----
export type SubscriptionStatus = 'OPEN' | 'UPCOMING' | 'CLOSED';

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  OPEN: '접수중',
  UPCOMING: '예정',
  CLOSED: '마감',
};

export const STATUS_TONE: Record<SubscriptionStatus, 'green' | 'blue' | 'gray'> = {
  OPEN: 'green',
  UPCOMING: 'blue',
  CLOSED: 'gray',
};

function dateInt(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export interface DerivedStatus {
  status: SubscriptionStatus;
  /** OPEN: 마감까지 남은 일수, UPCOMING: 시작까지 남은 일수, CLOSED: null */
  dday: number | null;
}

export function deriveStatus(
  receiptBegin: Date | null,
  receiptEnd: Date | null,
  today: Date = new Date(),
): DerivedStatus {
  const t = dateInt(today);
  if (receiptBegin && dateInt(receiptBegin) > t) {
    return { status: 'UPCOMING', dday: dayDiff(today, receiptBegin) };
  }
  if (receiptEnd && dateInt(receiptEnd) >= t && (!receiptBegin || dateInt(receiptBegin) <= t)) {
    return { status: 'OPEN', dday: dayDiff(today, receiptEnd) };
  }
  return { status: 'CLOSED', dday: null };
}

export function ddayLabel(d: DerivedStatus): string | null {
  if (d.dday == null) return null;
  if (d.status === 'OPEN') return d.dday === 0 ? '오늘 마감' : `D-${d.dday}`;
  if (d.status === 'UPCOMING') return d.dday === 0 ? '오늘 시작' : `${d.dday}일 후`;
  return null;
}

// ---- 카드 집계 포맷 ----
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  return min === max ? formatBillion(min) : `${formatBillion(min)}~${formatBillion(max)}`;
}

export function formatAreaRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  const a = formatPyeong(min);
  const b = formatPyeong(max);
  return a === b ? a : `${a}~${b}`;
}
