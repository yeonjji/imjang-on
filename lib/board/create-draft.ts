import { prisma } from '@/lib/db';
import type { GenerateResult } from '@/lib/board/generate';
import { runGuardrails } from '@/lib/board/guardrails';
import { buildBoardSlug } from '@/lib/board/slug';
import { sanitizeSourceName } from '@/lib/board/source-name';

export interface CreateDraftInput {
  gen: GenerateResult;
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  /** sourceDate가 원문의 실제 발행일이면 true. 미지정 시 false(수집일로 간주해 라벨이 갈린다). */
  sourceDateIsPublication?: boolean;
  sourceExcerpt: string;
  dedupeKey: string;
  dateISO: string;
  detectedFrom?: string;
  /** 손수 쓴 글만 지정한다. 미지정 시 자동 생성 글 상한(MAX_BODY_CHARS)이 적용된다. */
  maxLength?: number;
}
export type CreateDraftResult =
  | { status: 'created'; slug: string; id: bigint }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' };

export async function createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const existing = await prisma.post.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  if (existing) return { status: 'duplicate' };

  // 크롤 네비 찌꺼기('…부처별 뉴스 이동' 등)를 저장 전에 걷어낸다. 축약(정규화)은 표시 지점에서.
  const sourceName = sanitizeSourceName(input.sourceName);
  const guard = runGuardrails({
    body: input.gen.body,
    sourceName,
    sourceUrl: input.sourceUrl,
    maxLength: input.maxLength,
  });
  if (!guard.ok) return { status: 'rejected', violations: guard.violations };

  let slug = buildBoardSlug(input.gen.title, input.dateISO);
  for (let i = 2; await prisma.post.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = buildBoardSlug(input.gen.title, input.dateISO, i);
  }

  const created = await prisma.post.create({
    data: {
      slug,
      title: input.gen.title,
      summary: input.gen.summary,
      body: input.gen.body,
      type: input.gen.type,
      category: input.gen.category,
      status: 'DRAFT',
      sourceName,
      sourceUrl: input.sourceUrl,
      sourceDate: input.sourceDate,
      sourceDateIsPublication: input.sourceDateIsPublication ?? false,
      sourceExcerpt: input.sourceExcerpt,
      dedupeKey: input.dedupeKey,
      detectedFrom: input.detectedFrom,
    },
    select: { id: true },
  });
  return { status: 'created', slug, id: created.id };
}
