import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityItem } from '@/lib/amenity/category';
import { prisma } from '@/lib/db';
import { storeAmenitySlug } from '@/lib/amenity/infra';

/** Store 테이블을 백킹으로 쓰는 슬러그. 이들 사이에서만 id가 교차할 수 있다. */
const STORE_BACKED_SLUGS = new Set(['convenience', 'mart', 'cafe']);

/**
 * Store 기반 슬러그에서 조회에 실패했을 때, 같은 id를 실제로 서빙하는 슬러그의 경로.
 *
 * 예전에는 상세 조회에 업종 게이트가 없어 편의점 하나가 convenience·mart·cafe 세 URL 모두에서
 * 200을 냈고, 그 잘못된 URL이 링크·공유됐다. 게이트를 세운 뒤 그 URL들을 404로 두면 기존 링크가
 * 죽으므로, 정본 경로로 영구 이동시켜 중복 URL을 하나로 접는다. 서빙하는 슬러그가 없으면 null(404).
 */
export async function resolveStoreSlugRedirect(
  slug: string,
  id: bigint,
): Promise<string | null> {
  if (!STORE_BACKED_SLUGS.has(slug)) return null;
  const s = await prisma.store.findUnique({ where: { id }, select: { industryCode: true } });
  if (!s) return null;
  const target = storeAmenitySlug(s.industryCode);
  return target && target !== slug ? `/amenity/${target}/${id}` : null;
}

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
