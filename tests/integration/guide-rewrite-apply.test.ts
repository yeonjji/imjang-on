import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { GuideCategory, PostStatus } from '@prisma/client';
import { applyGuideRewrites } from '@/scripts/guide/apply-rewrites';

const PFX = 'ut-rw-';
const longBody = '본문 문장입니다. '.repeat(120);
const draft = (title: string) => `---\ntitle: ${title}\nsummary: 새 요약\n---\n${longBody}\n`;

async function guide(slug: string, status: PostStatus) {
  await prisma.guide.create({
    data: {
      slug, title: '옛 제목', summary: '옛 요약', body: '옛 본문', category: GuideCategory.REALESTATE, status,
      sourceName: '국토교통부', sourceUrl: 'https://rt.molit.go.kr', sourceDate: new Date('2026-01-01'),
      sourceExcerpt: 'x', dedupeKey: slug, publishedAt: new Date('2026-06-01'),
    },
  });
}

let dir: string;
beforeEach(async () => {
  await prisma.guide.deleteMany({ where: { slug: { startsWith: PFX } } });
  await guide(`${PFX}a`, PostStatus.PUBLISHED);
  await guide(`${PFX}draft`, PostStatus.DRAFT);
  dir = mkdtempSync(join(tmpdir(), 'rw-'));
  writeFileSync(join(dir, `${PFX}a.md`), draft('새 제목'));
  writeFileSync(join(dir, `${PFX}draft.md`), draft('초안 글'));
  writeFileSync(join(dir, `${PFX}missing.md`), draft('없는 글'));
});
afterAll(async () => {
  await prisma.guide.deleteMany({ where: { slug: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('applyGuideRewrites', () => {
  it('dry-run은 쓰지 않고 대상만 보고한다', async () => {
    const paths: string[][] = [];
    const r = await applyGuideRewrites({ dir, apply: false, revalidate: async (p) => { paths.push(p); } });
    expect(r.updated).toEqual([]);
    expect(r.wouldUpdate).toEqual([`${PFX}a`]);
    expect(r.skipped.map((s) => s.slug).sort()).toEqual([`${PFX}draft`, `${PFX}missing`]);
    expect((await prisma.guide.findUnique({ where: { slug: `${PFX}a` } }))?.title).toBe('옛 제목');
    expect(paths).toEqual([]);
  });

  it('apply는 게시된 글의 제목·요약·본문을 바꾸고 재검증한다(게시일은 유지)', async () => {
    const paths: string[][] = [];
    const r = await applyGuideRewrites({ dir, apply: true, revalidate: async (p) => { paths.push(p); } });
    expect(r.updated).toEqual([`${PFX}a`]);
    const g = await prisma.guide.findUnique({ where: { slug: `${PFX}a` } });
    expect(g?.title).toBe('새 제목');
    expect(g?.summary).toBe('새 요약');
    expect(g?.body.startsWith('본문 문장입니다.')).toBe(true);
    expect(g?.publishedAt?.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(g?.reviewedAt).not.toBeNull();
    expect((await prisma.guide.findUnique({ where: { slug: `${PFX}draft` } }))?.title).toBe('옛 제목');
    expect(paths).toEqual([['/guide', `/guide/${PFX}a`]]);
  });

  it('검증 실패 초안이 하나라도 있으면 아무것도 쓰지 않는다', async () => {
    writeFileSync(join(dir, `${PFX}a.md`), `---\ntitle: t\nsummary: s\n---\n짧다\n`);
    await expect(applyGuideRewrites({ dir, apply: true, revalidate: async () => {} })).rejects.toThrow(/검증 실패/);
    expect((await prisma.guide.findUnique({ where: { slug: `${PFX}a` } }))?.title).toBe('옛 제목');
  });
});
