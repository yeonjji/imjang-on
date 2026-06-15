import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { listPublishedPosts, getPublishedPostBySlug, PAGE_SIZE } from '@/lib/board/post';
import type { Prisma } from '@prisma/client';

assertLocalDatabase();
const MARK = 'test-board-';

function postData(over: Partial<Prisma.PostCreateInput>): Prisma.PostCreateInput {
  return {
    slug: `${MARK}${Math.random().toString(36).slice(2)}`,
    title: '테스트 글', summary: '요약', body: '# 본문\n\n내용',
    type: 'PROGRAM', category: 'LOAN', status: 'PUBLISHED',
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'), sourceExcerpt: '원문 발췌',
    dedupeKey: `${MARK}${Math.random().toString(36).slice(2)}`, publishedAt: new Date(),
    ...over,
  };
}
beforeEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });
afterEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });

describe('listPublishedPosts', () => {
  it('PUBLISHED만 노출하고 DRAFT/REJECTED는 제외한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}pub`, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}draft`, status: 'DRAFT' }) });
    const { rows, total } = await listPublishedPosts({ page: 1 });
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}pub`);
    expect(slugs).not.toContain(`${MARK}draft`);
    expect(total).toBeGreaterThanOrEqual(1);
  });
  it('카테고리로 필터한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}loan`, category: 'LOAN' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}fin`, category: 'FINANCE' }) });
    const { rows } = await listPublishedPosts({ page: 1, category: 'FINANCE' });
    const mine = rows.filter((r) => r.slug.startsWith(MARK));
    expect(mine.every((r) => r.category === 'FINANCE')).toBe(true);
    expect(mine.some((r) => r.slug === `${MARK}fin`)).toBe(true);
  });
  it('publishedAt 내림차순으로 정렬한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}old`, publishedAt: new Date('2026-01-01') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}new`, publishedAt: new Date('2026-06-01') }) });
    const { rows } = await listPublishedPosts({ page: 1 });
    const mine = rows.filter((r) => r.slug.startsWith(MARK));
    expect(mine[0].slug).toBe(`${MARK}new`);
  });
});
describe('getPublishedPostBySlug', () => {
  it('PUBLISHED 글을 slug로 가져온다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}one`, body: '# 제목\n표' }) });
    const post = await getPublishedPostBySlug(`${MARK}one`);
    expect(post).not.toBeNull();
    expect(post!.body).toContain('제목');
    expect(post!.sourceName).toBe('국토교통부');
  });
  it('DRAFT 글은 null을 반환한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}hidden`, status: 'DRAFT' }) });
    expect(await getPublishedPostBySlug(`${MARK}hidden`)).toBeNull();
  });
});
describe('PAGE_SIZE', () => { it('양의 정수다', () => { expect(PAGE_SIZE).toBeGreaterThan(0); }); });
