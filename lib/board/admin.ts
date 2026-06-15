import { prisma } from '@/lib/db';
import type { PostStatus, PostType, PostCategory } from '@prisma/client';

export interface AdminPostRow {
  id: bigint;
  slug: string;
  title: string;
  type: PostType;
  category: PostCategory;
  status: PostStatus;
  sourceName: string;
  sourceDate: Date;
  generatedAt: Date;
}

export async function listPostsByStatus(status: PostStatus): Promise<AdminPostRow[]> {
  return prisma.post.findMany({
    where: { status },
    select: { id: true, slug: true, title: true, type: true, category: true, status: true, sourceName: true, sourceDate: true, generatedAt: true },
    orderBy: { generatedAt: 'desc' },
    take: 200,
  });
}

export async function getPostForAdmin(id: bigint) {
  return prisma.post.findUnique({ where: { id } });
}

export async function publishPostRow(id: bigint): Promise<{ slug: string }> {
  const now = new Date();
  return prisma.post.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: now, reviewedAt: now },
    select: { slug: true },
  });
}

export async function rejectPostRow(id: bigint): Promise<void> {
  await prisma.post.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
}

export interface PostEditableFields {
  title: string;
  summary: string;
  body: string;
  type: PostType;
  category: PostCategory;
}

export async function updatePostRow(id: bigint, data: PostEditableFields): Promise<void> {
  await prisma.post.update({ where: { id }, data });
}

export async function deletePostRow(id: bigint): Promise<void> {
  await prisma.post.delete({ where: { id } });
}
