import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityListFilter, AmenityListResult } from '@/lib/amenity/category';

export function normalizePage(raw: string | undefined): number {
  const n = Number(raw ?? '1');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** 카테고리 슬러그 → 어댑터.getList 디스패치. 미지원 슬러그는 throw. */
export async function getAmenityList(
  slug: string,
  filter: AmenityListFilter,
  page: number,
): Promise<AmenityListResult> {
  const def = getCategoryDef(slug);
  if (!def) throw new Error(`Unknown amenity category: ${slug}`);
  return def.getList(filter, Math.max(1, page));
}
