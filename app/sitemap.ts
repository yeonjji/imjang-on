import type { MetadataRoute } from 'next';
import { buildManifest } from '@/lib/sitemap/manifest';
import { CHUNK_SIZE, SOURCE_MAP, loadCounts } from '@/lib/sitemap/sources';

export const revalidate = 86_400;

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const counts = await loadCounts();
  return buildManifest(counts, CHUNK_SIZE).map((s) => ({ id: s.id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const counts = await loadCounts();
  const shard = buildManifest(counts, CHUNK_SIZE).find((s) => s.id === id);
  if (!shard) return [];
  const source = SOURCE_MAP[shard.key];
  if (!source) return [];
  return source.page(shard.offset, shard.limit);
}
