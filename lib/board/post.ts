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

/**
 * 라우트 param의 slug를 정규화한다. Next 프로덕션 서버는 동적 param을 퍼센트
 * 인코딩된 상태로 넘기므로(예: 한글 slug), 디코드 후 NFC로 맞춰 저장값과 비교한다.
 * 이미 디코드된 ASCII는 no-op, 잘못된 % 시퀀스는 원문 유지.
 */
export function normalizeSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // 잘못된 퍼센트 시퀀스 → 원문 사용
  }
  return decoded.normalize('NFC');
}

export async function getPublishedPostBySlug(slug: string) {
  const post = await prisma.post.findFirst({
    where: { slug: normalizeSlug(slug), status: 'PUBLISHED' },
    select: {
      slug: true, title: true, summary: true, body: true, type: true,
      category: true, sourceName: true, sourceUrl: true, sourceDate: true, publishedAt: true,
    },
  });
  if (!post || !post.publishedAt) return null;
  return { ...post, publishedAt: post.publishedAt };
}
