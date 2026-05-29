import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanItem } from '@/lib/urban/category';

export async function getUrbanById(slug: string, id: bigint): Promise<UrbanItem | null> {
  const def = getUrbanCategoryDef(slug);
  if (!def) return null;
  return def.getById(id);
}

export async function getUrbanLatLng(
  slug: string,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const def = getUrbanCategoryDef(slug);
  if (!def) return null;
  return def.getLatLng(id);
}
