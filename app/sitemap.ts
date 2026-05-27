import { prisma } from '@/lib/db';
import { getAllSigungus } from '@/lib/region';
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export const revalidate = 86_400;

const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/region`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/life`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE}/school`, changeFrequency: 'weekly', priority: 0.8 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // DB 장애 시에도 최소 entries로 빌드가 깨지지 않도록 보호
  // (revalidate 1일 안에 자동 복구)
  try {
    const [sigungus, properties, schoolSigungus] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      prisma.property.findMany({
        where: { txCount12m: { gt: 0 } },
        select: { id: true, propertyType: true, updatedAt: true },
      }),
      getAllSigungus().catch(() => []),
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
