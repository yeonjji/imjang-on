import { prisma } from '@/lib/db';
import type { PostType, PostCategory } from '@prisma/client';
import { findForbiddenPhrases } from '@/lib/board/guardrails';
import { buildBoardSlug } from '@/lib/board/slug';

export interface GenLike {
  type: string;
  category: string;
  title: string;
  summary: string;
  body: string;
}

export interface CreateDraftInput {
  gen: GenLike;
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceExcerpt: string;
  dedupeKey: string;
  dateISO: string;
  detectedFrom?: string;
}
export type CreateDraftResult =
  | { status: 'created'; slug: string }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' };

export async function createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const existing = await prisma.post.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  if (existing) return { status: 'duplicate' };

  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenPhrases(input.gen.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  if (violations.length) return { status: 'rejected', violations };

  let slug = buildBoardSlug(input.gen.title, input.dateISO);
  for (let i = 2; await prisma.post.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = buildBoardSlug(input.gen.title, input.dateISO, i);
  }

  await prisma.post.create({
    data: {
      slug,
      title: input.gen.title,
      summary: input.gen.summary,
      body: input.gen.body,
      type: input.gen.type as PostType,
      category: input.gen.category as PostCategory,
      status: 'DRAFT',
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      sourceDate: input.sourceDate,
      sourceExcerpt: input.sourceExcerpt,
      dedupeKey: input.dedupeKey,
      detectedFrom: input.detectedFrom,
    },
  });
  return { status: 'created', slug };
}
