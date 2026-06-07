import type { MetadataRoute } from 'next';
import { buildManifest } from '@/lib/sitemap/manifest';
import { CHUNK_SIZE, SOURCE_MAP, loadCounts } from '@/lib/sitemap/sources';

export const revalidate = 86_400;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXml(entry: MetadataRoute.Sitemap[number]): string {
  const parts = [`<loc>${xmlEscape(String(entry.url))}</loc>`];
  if (entry.lastModified) {
    parts.push(`<lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>`);
  }
  if (entry.changeFrequency) parts.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
  if (entry.priority != null) parts.push(`<priority>${entry.priority}</priority>`);
  return `  <url>${parts.join('')}</url>`;
}

// 자식 sitemap. id는 sitemap 인덱스(buildManifest)가 부여한 샤드 번호.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shardId = Number(id);
  const counts = await loadCounts();
  const shard = buildManifest(counts, CHUNK_SIZE).find((s) => s.id === shardId);
  const source = shard ? SOURCE_MAP[shard.key] : undefined;
  if (!shard || !source) {
    return new Response('Not found', { status: 404 });
  }
  const entries = await source.page(shard.offset, shard.limit);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(toXml).join('\n')}
</urlset>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
