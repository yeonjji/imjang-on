import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import {
  listPostsByStatus, getPostForAdmin, publishPostRow, rejectPostRow, updatePostRow, deletePostRow,
} from '@/lib/board/admin';
import type { Prisma } from '@prisma/client';

assertLocalDatabase();
const MARK = 'test-admin-';

function data(over: Partial<Prisma.PostCreateInput> = {}): Prisma.PostCreateInput {
  const r = Math.random().toString(36).slice(2);
  return {
    slug: `${MARK}${r}`, title: '초안 글', summary: '요약', body: '# 본문',
    type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'), sourceExcerpt: '원문 발췌 전문',
    dedupeKey: `${MARK}${r}`, ...over,
  };
}
beforeEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });
afterEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });

describe('listPostsByStatus', () => {
  it('해당 상태의 글만 최신순으로 반환한다', async () => {
    await prisma.post.create({ data: data({ slug: `${MARK}d1`, status: 'DRAFT' }) });
    await prisma.post.create({ data: data({ slug: `${MARK}p1`, status: 'PUBLISHED', publishedAt: new Date() }) });
    const drafts = await listPostsByStatus('DRAFT');
    const slugs = drafts.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}d1`);
    expect(slugs).not.toContain(`${MARK}p1`);
  });
});
describe('getPostForAdmin', () => {
  it('sourceExcerpt 포함 전체 필드를 반환한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}g1` }) });
    const post = await getPostForAdmin(c.id);
    expect(post).not.toBeNull();
    expect(post!.sourceExcerpt).toBe('원문 발췌 전문');
    expect(post!.body).toBe('# 본문');
  });
  it('없는 id면 null', async () => { expect(await getPostForAdmin(BigInt(-1))).toBeNull(); });
});
describe('publishPostRow', () => {
  it('PUBLISHED로 바꾸고 publishedAt·reviewedAt을 채우며 slug를 돌려준다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}pub`, status: 'DRAFT' }) });
    const res = await publishPostRow(c.id);
    expect(res.slug).toBe(`${MARK}pub`);
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe('PUBLISHED');
    expect(after!.publishedAt).not.toBeNull();
    expect(after!.reviewedAt).not.toBeNull();
  });
});
describe('rejectPostRow', () => {
  it('REJECTED로 바꾸고 reviewedAt을 채운다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}rej` }) });
    await rejectPostRow(c.id);
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe('REJECTED');
    expect(after!.reviewedAt).not.toBeNull();
  });
});
describe('updatePostRow', () => {
  it('수정 가능한 필드만 갱신한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}upd` }) });
    await updatePostRow(c.id, { title: '수정된 제목', summary: '새 요약', body: '## 새 본문', type: 'TREND', category: 'FINANCE' });
    const after = await prisma.post.findUnique({ where: { id: c.id } });
    expect(after!.title).toBe('수정된 제목');
    expect(after!.type).toBe('TREND');
    expect(after!.category).toBe('FINANCE');
    expect(after!.body).toBe('## 새 본문');
  });
});
describe('deletePostRow', () => {
  it('행을 삭제한다', async () => {
    const c = await prisma.post.create({ data: data({ slug: `${MARK}del` }) });
    await deletePostRow(c.id);
    expect(await prisma.post.findUnique({ where: { id: c.id } })).toBeNull();
  });
});
