import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityItem } from '@/lib/amenity/category';

export async function getAmenityById(slug: string, id: bigint): Promise<AmenityItem | null> {
  const def = getCategoryDef(slug);
  if (!def) return null;
  return def.getById(id);
}

export async function getAmenityLatLng(
  slug: string,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const def = getCategoryDef(slug);
  if (!def) return null;
  return def.getLatLng(id);
}
