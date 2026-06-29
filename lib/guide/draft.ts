import type { GuideCategory } from '@prisma/client';
import type { GuideSeed } from '@/lib/guide/seeds';
import type { GenerateGuideResult } from '@/lib/guide/generate';
import { buildGuideSlug } from '@/lib/guide/slug';

/** prisma.guide.create({ data }) 에 넣을 수 있는 형태(status는 기본 DRAFT라 생략). */
export interface GuideDraftData {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: GuideCategory;
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceExcerpt: string;
  dedupeKey: string;
}

/** 시드 + LLM 결과를 Guide insert 객체로 조립한다(순수). dedupeKey=시드 key로 재생성 방지. */
export function buildGuideDraft(seed: GuideSeed, llm: GenerateGuideResult): GuideDraftData {
  return {
    slug: buildGuideSlug(llm.title),
    title: llm.title,
    summary: llm.summary,
    body: llm.body,
    category: seed.category,
    sourceName: seed.source.name,
    sourceUrl: seed.source.url,
    sourceDate: new Date(seed.source.date),
    sourceExcerpt: seed.source.excerpt,
    dedupeKey: seed.key,
  };
}
