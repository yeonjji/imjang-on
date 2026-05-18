import { prisma } from '@/lib/db';
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export const revalidate = 86_400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sigungus, properties] = await Promise.all([
    prisma.region.findMany({
      where: { level: 2, isAbolished: false },
      select: { code: true },
    }),
    prisma.property.findMany({
      where: { txCount12m: { gt: 0 } },
      select: { id: true, propertyType: true, updatedAt: true },
    }),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/apt`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/officetel`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/villa`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/region`, changeFrequency: 'weekly', priority: 0.8 },
  ];

  for (const r of sigungus) {
    entries.push({
      url: `${SITE}/region/${r.code.slice(0, 5)}`,
      changeFrequency: 'daily',
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
}
