import { prisma } from '@/lib/db';
import type { PostCategory } from '@prisma/client';
import { BOARD_CATEGORIES } from '@/lib/board/labels';
import { canonicalizeSourceName } from '@/lib/board/source-name';

export const PAGE_SIZE = 12;

export interface PostListItem {
  id: bigint;
  slug: string;
  title: string;
  category: PostCategory;
  sourceName: string;
  publishedAt: Date;
}

interface ListParams { page: number; category?: PostCategory; }

export async function listPublishedPosts(
  params: ListParams,
): Promise<{ rows: PostListItem[]; total: number; totalPages: number }> {
  const page = Number.isFinite(params.page) ? Math.max(1, Math.floor(params.page)) : 1;
  const where = {
    status: 'PUBLISHED' as const,
    ...(params.category ? { category: params.category } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: { id: true, slug: true, title: true, category: true, sourceName: true, publishedAt: true },
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

const POST_DETAIL_SELECT = {
  id: true, slug: true, title: true, summary: true, body: true, type: true,
  category: true, sourceName: true, sourceUrl: true, sourceDate: true, sourceDateIsPublication: true,
  generatedAt: true, publishedAt: true,
} as const;

/** 레거시 slug 조회용(옛 `/board/<slug>` URL → 새 canonical 리다이렉트에 사용). */
export async function getPublishedPostBySlug(slug: string) {
  const post = await prisma.post.findFirst({
    where: { slug: normalizeSlug(slug), status: 'PUBLISHED' },
    select: POST_DETAIL_SELECT,
  });
  if (!post || !post.publishedAt) return null;
  return { ...post, publishedAt: post.publishedAt };
}

/** 상세 페이지 정규 조회 키: id. PUBLISHED 글만 반환한다. */
export async function getPublishedPostById(id: bigint) {
  const post = await prisma.post.findFirst({
    where: { id, status: 'PUBLISHED' },
    select: POST_DETAIL_SELECT,
  });
  if (!post || !post.publishedAt) return null;
  return { ...post, publishedAt: post.publishedAt };
}

/** 레일용: PUBLISHED 글을 카테고리별로 집계한다(0건 카테고리도 0으로 포함). */
export async function getBoardCategoryCounts(): Promise<Record<PostCategory, number>> {
  const grouped = await prisma.post.groupBy({
    by: ['category'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(
    BOARD_CATEGORIES.map((c) => [c.value, 0]),
  ) as Record<PostCategory, number>;
  for (const g of grouped) counts[g.category] = g._count._all;
  return counts;
}

/** 레일용: PUBLISHED 글의 출처기관을 글 수 내림차순 distinct로 반환한다(정식 기관명으로 축약·중복 병합). */
export async function getBoardSourceOrgs(limit = 8): Promise<string[]> {
  const grouped = await prisma.post.groupBy({
    by: ['sourceName'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
    orderBy: { _count: { sourceName: 'desc' } },
  });
  // 정규화하면 서로 다른 원본이 같은 기관명으로 합쳐질 수 있어(예: '정책브리핑'·'대한민국 정책브리핑(국토교통부)'),
  // 축약 후 첫 등장 순서(=글 수 내림차순)를 보존하며 중복을 제거하고 상한을 적용한다.
  const seen = new Set<string>();
  const orgs: string[] = [];
  for (const g of grouped) {
    const name = canonicalizeSourceName(g.sourceName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    orgs.push(name);
    if (orgs.length >= limit) break;
  }
  return orgs;
}

export interface HomePostItem {
  id: bigint;
  slug: string;
  title: string;
  summary: string;
  category: PostCategory;
  sourceName: string;
  publishedAt: Date;
}

/** 홈 '오늘의 소식'용: PUBLISHED 글 최신 N건(대표 카드 summary 포함). */
export async function getHomeLatestPosts(limit = 5, excludeId?: bigint): Promise<HomePostItem[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED', ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
    select: { id: true, slug: true, title: true, summary: true, category: true, sourceName: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
}
