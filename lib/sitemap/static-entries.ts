import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AMENITY_SLUGS, AMENITY_CATEGORIES, amenityListPath } from '@/lib/amenity/category';
import { URBAN_SLUGS, URBAN_CATEGORIES, urbanListPath } from '@/lib/urban/category';
import { isBoardPublic } from '@/lib/board/visibility';

export const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE_URL}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/school`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/school/regions`, changeFrequency: 'weekly', priority: 0.7 },
  // 카테고리 허브는 canonical과 **같은 정본 경로**로 담는다(amenityListPath/urbanListPath).
  // 종전에는 amenity 전부를 ?sido=서울로 넣어 전통시장(스코프 불필요, bare가 정본)과 어긋났고,
  // urban은 parking 하나만 들어가 park·charger 허브가 사이트맵에서 빠져 있었다.
  ...AMENITY_SLUGS.map((slug) => ({
    url: `${SITE_URL}${amenityListPath(AMENITY_CATEGORIES[slug])}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  })),
  ...URBAN_SLUGS.map((slug) => ({
    url: `${SITE_URL}${urbanListPath(URBAN_CATEGORIES[slug])}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  })),
  // 생활 인프라 허브 — 상세가 사이트맵에 있는데도(병원·어린이집) 부모 허브가 빠져 있었다.
  { url: `${SITE_URL}/childcare`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/childcare/regions`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/medical/hospital`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/medical/pharmacy`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/subscription`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/finance`, changeFrequency: 'monthly', priority: 0.8 },
  { url: `${SITE_URL}/jeonse-guarantee`, changeFrequency: 'monthly', priority: 0.8 },
  // 게시판 공개 여부는 isBoardPublic()로 일원화. 현재 상시 공개라 /board를 항상 포함한다.
  ...(isBoardPublic()
    ? ([{ url: `${SITE_URL}/board`, changeFrequency: 'daily', priority: 0.8 }] as MetadataRoute.Sitemap)
    : []),
  // 가이드 상세 28건은 사이트맵에 있는데 정작 부모 허브가 빠져 있었다 — 사람 검수 원본
  // 레이어의 진입점이라 우선순위는 /board와 같게 둔다.
  { url: `${SITE_URL}/guide`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/data-source`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/sitemap`, changeFrequency: 'monthly', priority: 0.3 },
];
