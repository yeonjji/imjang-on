import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AMENITY_SLUGS } from '@/lib/amenity/category';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import { isBoardPublic } from '@/lib/board/visibility';

export const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE_URL}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/region`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/life`, changeFrequency: 'weekly', priority: 0.8 },
  ...LIFE_GROUPS.map((g) => ({
    url: `${SITE_URL}/life/${g.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  })),
  { url: `${SITE_URL}/school`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/school/regions`, changeFrequency: 'weekly', priority: 0.7 },
  ...AMENITY_SLUGS.map((slug) => ({
    url: `${SITE_URL}/amenity/${slug}?sido=${encodeURIComponent('서울')}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  })),
  { url: `${SITE_URL}/urban/parking`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/urban/parking?sido=${encodeURIComponent('서울')}`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/subscription`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/finance`, changeFrequency: 'monthly', priority: 0.8 },
  // 게시판 공개 여부는 isBoardPublic()로 일원화. 현재 상시 공개라 /board를 항상 포함한다.
  ...(isBoardPublic()
    ? ([{ url: `${SITE_URL}/board`, changeFrequency: 'daily', priority: 0.8 }] as MetadataRoute.Sitemap)
    : []),
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/data-source`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/sitemap`, changeFrequency: 'monthly', priority: 0.3 },
];
