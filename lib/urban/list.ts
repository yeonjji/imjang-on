import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanListFilter, UrbanListResult } from '@/lib/urban/category';

export function normalizePage(raw: string | undefined): number {
  const n = Number(raw ?? '1');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function getUrbanList(
  slug: string,
  filter: UrbanListFilter,
  page: number,
): Promise<UrbanListResult> {
  const def = getUrbanCategoryDef(slug);
  if (!def) throw new Error(`Unknown urban category: ${slug}`);
  return def.getList(filter, Math.max(1, page));
}
