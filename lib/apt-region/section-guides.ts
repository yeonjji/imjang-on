import { cache } from 'react';
import { prisma } from '@/lib/db';

/**
 * 아파트 상세 섹션별 관련 분석 가이드(PR2). 해당 섹션이 화면에 나올 때만 그 아래에 한 줄로 연결한다.
 * 페이지 하단 '관련 가이드'(카테고리 최신 글)는 그대로 둔다 — 이건 섹션 내용과 직접 맞닿은 글만.
 */
export const SECTION_GUIDE_SLUGS = {
  rent: ['전세갱신하면보증금은실제로얼마나올랐을까'],
  maintenance: ['준공연도별관리비구축과신축은어디서차이날까'],
  building: ['우리집내진설계건축물대장으로확인하기', '복도식과계단식가격과관리비는얼마나다를까'],
  subscriptions: ['분양가는주변시세보다정말쌀까'],
  school: ['초품아는얼마나될까단지에서배정초등학교까지거리'],
  subway: ['단지안내의역까지5분실제거리와맞을까'],
} as const;
export type GuideSection = keyof typeof SECTION_GUIDE_SLUGS;
export type SectionGuides = Partial<Record<GuideSection, { slug: string; title: string }[]>>;

/** 게시 중인 가이드만 돌려준다(내려간 글로 404 링크가 생기지 않게). 요청당 1쿼리. */
export const getSectionGuides = cache(async (): Promise<SectionGuides> => {
  const all = Object.values(SECTION_GUIDE_SLUGS).flat();
  const rows = await prisma.guide.findMany({
    where: { slug: { in: all }, status: 'PUBLISHED' },
    select: { slug: true, title: true },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const out: SectionGuides = {};
  for (const [section, slugs] of Object.entries(SECTION_GUIDE_SLUGS) as [GuideSection, readonly string[]][]) {
    const items = slugs.flatMap((s) => (bySlug.has(s) ? [bySlug.get(s)!] : []));
    if (items.length) out[section] = items;
  }
  return out;
});
