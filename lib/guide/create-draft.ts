import { prisma } from '@/lib/db';
import type { GuideSeed } from '@/lib/guide/seeds';
import type { GenerateGuideResult } from '@/lib/guide/generate';
import { buildGuideDraft } from '@/lib/guide/draft';
import { buildGuideSlug } from '@/lib/guide/slug';
import { runGuideGuardrails } from '@/lib/guide/guardrails';

export type CreateGuideDraftResult =
  | { status: 'created'; slug: string; id: bigint }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' };

/** 시드+LLM 결과 → 가드레일 검사 후 DRAFT 저장. dedupeKey 중복 시 duplicate. (board createDraft 미러) */
export async function createGuideDraft(
  seed: GuideSeed,
  llm: GenerateGuideResult,
): Promise<CreateGuideDraftResult> {
  const existing = await prisma.guide.findUnique({ where: { dedupeKey: seed.key }, select: { id: true } });
  if (existing) return { status: 'duplicate' };

  const data = buildGuideDraft(seed, llm);
  const guard = runGuideGuardrails({ body: data.body, sourceName: data.sourceName, sourceUrl: data.sourceUrl });
  if (!guard.ok) return { status: 'rejected', violations: guard.violations };

  let slug = data.slug;
  for (let i = 2; await prisma.guide.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = buildGuideSlug(data.title, i);
  }

  const created = await prisma.guide.create({ data: { ...data, slug }, select: { id: true } });
  return { status: 'created', slug, id: created.id };
}
