import { prisma } from '@/lib/db';
import type { PostStatus, GuideCategory } from '@prisma/client';

export interface AdminGuideRow {
  id: bigint;
  slug: string;
  title: string;
  category: GuideCategory;
  status: PostStatus;
  sourceName: string;
  sourceDate: Date;
  generatedAt: Date;
}

export async function listGuidesByStatus(status: PostStatus): Promise<AdminGuideRow[]> {
  return prisma.guide.findMany({
    where: { status },
    select: { id: true, slug: true, title: true, category: true, status: true, sourceName: true, sourceDate: true, generatedAt: true },
    orderBy: { generatedAt: 'desc' },
    take: 200,
  });
}

export async function getGuideForAdmin(id: bigint) {
  return prisma.guide.findUnique({ where: { id } });
}

export async function publishGuideRow(id: bigint): Promise<{ slug: string }> {
  const now = new Date();
  return prisma.guide.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: now, reviewedAt: now }, select: { slug: true } });
}

export async function rejectGuideRow(id: bigint): Promise<void> {
  await prisma.guide.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
}

export interface GuideEditableFields {
  title: string;
  summary: string;
  body: string;
  category: GuideCategory;
}

export async function updateGuideRow(id: bigint, data: GuideEditableFields): Promise<void> {
  await prisma.guide.update({ where: { id }, data });
}

export async function deleteGuideRow(id: bigint): Promise<void> {
  await prisma.guide.delete({ where: { id } });
}
