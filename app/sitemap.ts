import { prisma } from '@/lib/db';
import { getAllSigungus } from '@/lib/region';
import { AMENITY_CATEGORIES, AMENITY_SLUGS } from '@/lib/amenity/category';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export const revalidate = 86_400;

export const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/region`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/life`, changeFrequency: 'weekly', priority: 0.8 },
  ...LIFE_GROUPS.map((g) => ({
    url: `${SITE}/life/${g.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  })),
  { url: `${SITE}/school`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/school/regions`, changeFrequency: 'weekly', priority: 0.7 },
  ...AMENITY_SLUGS.map((slug) => ({
    url: `${SITE}/amenity/${slug}?sido=${encodeURIComponent('서울')}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  })),
  { url: `${SITE}/urban/parking`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE}/urban/parking?sido=${encodeURIComponent('서울')}`, changeFrequency: 'weekly', priority: 0.6 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // DB 장애 시에도 최소 entries로 빌드가 깨지지 않도록 보호
  // (revalidate 1일 안에 자동 복구)
  try {
    const [sigungus, properties, schoolSigungus, amenityCountsBySlug] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      prisma.property.findMany({
        where: { txCount12m: { gt: 0 } },
        select: { id: true, propertyType: true, updatedAt: true },
      }),
      getAllSigungus().catch(() => []),
      Promise.all(
        AMENITY_SLUGS.map(async (slug) => ({
          slug,
          counts: await AMENITY_CATEGORIES[slug].getCountsBySigungu().catch(() => new Map<string, number>()),
        })),
      ),
    ]);

    const entries: MetadataRoute.Sitemap = [...STATIC_ENTRIES];

    for (const r of sigungus) {
      entries.push({
        url: `${SITE}/region/${r.code.slice(0, 5)}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
    for (const s of schoolSigungus) {
      entries.push({
        url: `${SITE}/school/${s.sigunguCode}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
    for (const { slug, counts } of amenityCountsBySlug) {
      for (const [sigunguCode, count] of counts) {
        if (count <= 0) continue;
        entries.push({
          url: `${SITE}/amenity/${slug}?region=${sigunguCode}`,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
    for (const p of properties) {
      const prefix =
        p.propertyType === 'APARTMENT' ? 'apt' : p.propertyType === 'OFFICETEL' ? 'officetel' : 'villa';
      entries.push({
        url: `${SITE}/${prefix}/${p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
    return entries;
  } catch (err) {
    console.error('sitemap: DB unavailable, returning static entries only', err);
    return STATIC_ENTRIES;
  }
}
