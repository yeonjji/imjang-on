import { prisma } from '@/lib/db';
import type { GuideCategory } from '@prisma/client';
import { normalizeSlug } from '@/lib/board/post';

export const GUIDE_PAGE_SIZE = 12;

export interface GuideListItem {
  id: bigint;
  slug: string;
  title: string;
  summary: string;
  category: GuideCategory;
  publishedAt: Date;
}

interface ListParams { page: number; category?: GuideCategory; }

export async function listPublishedGuides(
  params: ListParams,
): Promise<{ rows: GuideListItem[]; total: number; totalPages: number }> {
  const page = Number.isFinite(params.page) ? Math.max(1, Math.floor(params.page)) : 1;
  const where = { status: 'PUBLISHED' as const, ...(params.category ? { category: params.category } : {}) };
  const [total, rows] = await Promise.all([
    prisma.guide.count({ where }),
    prisma.guide.findMany({
      where,
      select: { id: true, slug: true, title: true, summary: true, category: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * GUIDE_PAGE_SIZE,
      take: GUIDE_PAGE_SIZE,
    }),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, publishedAt: r.publishedAt! })),
    total,
    totalPages: Math.max(1, Math.ceil(total / GUIDE_PAGE_SIZE)),
  };
}

const GUIDE_DETAIL_SELECT = {
  id: true, slug: true, title: true, summary: true, body: true, category: true,
  sourceName: true, sourceUrl: true, sourceDate: true, publishedAt: true,
} as const;

export async function getPublishedGuideBySlug(slug: string) {
  const g = await prisma.guide.findFirst({ where: { slug: normalizeSlug(slug), status: 'PUBLISHED' }, select: GUIDE_DETAIL_SELECT });
  if (!g || !g.publishedAt) return null;
  return { ...g, publishedAt: g.publishedAt };
}

export interface RelatedGuideItem { id: bigint; slug: string; title: string; }

/** POI 상세 '관련 가이드'용: 카테고리별 PUBLISHED 가이드 N건(최신). */
export async function getGuidesByCategory(category: GuideCategory, limit = 3): Promise<RelatedGuideItem[]> {
  return prisma.guide.findMany({
    where: { status: 'PUBLISHED', category },
    select: { id: true, slug: true, title: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
}
