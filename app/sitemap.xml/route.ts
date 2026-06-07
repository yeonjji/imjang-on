import { buildManifest } from '@/lib/sitemap/manifest';
import { CHUNK_SIZE, loadCounts } from '@/lib/sitemap/sources';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86_400;

// sitemap 인덱스. 자식 sitemap은 /sitemaps/{id} 로 서빙된다.
export async function GET() {
  const counts = await loadCounts();
  const shards = buildManifest(counts, CHUNK_SIZE);
  const entries = shards
    .map((s) => `  <sitemap><loc>${SITE_URL}/sitemaps/${s.id}</loc></sitemap>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
