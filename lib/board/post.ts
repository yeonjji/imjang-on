import { prisma } from '@/lib/db';
import type { PostCategory } from '@prisma/client';

export const PAGE_SIZE = 12;

export interface PostListItem {
  slug: string;
  title: string;
  summary: string;
  category: PostCategory;
  sourceDate: Date;
  publishedAt: Date;
}

interface ListParams { page: number; category?: PostCategory; }

export async function listPublishedPosts(
  params: ListParams,
): Promise<{ rows: PostListItem[]; total: number; totalPages: number }> {
  const page = Math.max(1, params.page);
  const where = {
    status: 'PUBLISHED' as const,
    ...(params.category ? { category: params.category } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: { slug: true, title: true, summary: true, category: true, sourceDate: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, publishedAt: r.publishedAt! })),
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getPublishedPostBySlug(slug: string) {
  const post = await prisma.post.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      slug: true, title: true, summary: true, body: true, type: true,
      category: true, sourceName: true, sourceUrl: true, sourceDate: true, publishedAt: true,
    },
  });
  if (!post || !post.publishedAt) return null;
  return { ...post, publishedAt: post.publishedAt };
}
