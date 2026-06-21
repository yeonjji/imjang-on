import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// 게시판은 상시 공개이므로 post 소스는 항상 SOURCE_MAP에 포함된다(PUBLISHED 글만).
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
  it('PUBLISHED 글의 URL 엔트리를 id 기반으로 만든다', async () => {
    const created = await prisma.post.create({ data: {
      slug: `${MARK}a`, title: '집값 0.90% 상승', summary: 's', body: 'b',
      type: 'PROGRAM', category: 'LOAN', status: 'PUBLISHED',
      sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
      sourceExcerpt: 'e', dedupeKey: `${MARK}a`, publishedAt: new Date(),
    }, select: { id: true } });
    const entries = await SOURCE_MAP.post.page(0, 100);
    const urls = entries.map((e) => String(e.url));
    // /board/<id> 형식 — 제목 글자가 경로에 없으니 raw % 같은 깨짐이 원천 불가
    const mine = urls.find((u) => u.endsWith(`/board/${created.id}`));
    expect(mine).toBeDefined();
    expect(mine!).not.toMatch(/[%?#]/);
  });
  it('DRAFT 글은 사이트맵에서 제외한다', async () => {
    const created = await prisma.post.create({ data: {
      slug: `${MARK}d`, title: 't', summary: 's', body: 'b',
      type: 'PROGRAM', category: 'LOAN', status: 'DRAFT',
      sourceName: 'x', sourceUrl: 'https://x.kr', sourceDate: new Date('2026-06-12'),
      sourceExcerpt: 'e', dedupeKey: `${MARK}d`,
    }, select: { id: true } });
    const entries = await SOURCE_MAP.post.page(0, 100);
    expect(entries.map((e) => String(e.url)).some((u) => u.endsWith(`/board/${created.id}`))).toBe(false);
  });
});
