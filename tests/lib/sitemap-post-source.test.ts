import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { SOURCE_MAP } from '@/lib/sitemap/sources';

assertLocalDatabase();
const MARK = 'test-sitemap-';

afterEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });
beforeEach(async () => { await prisma.post.deleteMany({ where: { slug: { startsWith: MARK } } }); });

describe('sitemap post 소스', () => {
  it('SOURCE_MAP에 post 소스가 있다', () => {
    expect(SOURCE_MAP.post).toBeDefined();
  });
  it('PUBLISHED 글의 URL 엔트리를 만든다', async () => {
    await prisma.post.create({ data: {
      slug: `${MARK}a`, title: 't', summary: 's', body: 'b',
      type: 'PROGRAM', category: 'LOAN', status: 'PUBLISHED',
      sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
      sourceExcerpt: 'e', dedupeKey: `${MARK}a`, publishedAt: new Date(),
    }});
    const entries = await SOURCE_MAP.post.page(0, 100);
    const urls = entries.map((e) => String(e.url));
    expect(urls.some((u) => u.endsWith(`/board/${MARK}a`))).toBe(true);
  });
  it('DRAFT 글은 사이트맵에서 제외한다', async () => {
    await prisma.post.create({ data: {
      slug: `${MARK}d`, title: 't', summary: 's', body: 'b',
      type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
      sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
      sourceExcerpt: 'e', dedupeKey: `${MARK}d`,
    }});
    const entries = await SOURCE_MAP.post.page(0, 100);
    expect(entries.map((e) => String(e.url)).some((u) => u.endsWith(`/board/${MARK}d`))).toBe(false);
  });
});
