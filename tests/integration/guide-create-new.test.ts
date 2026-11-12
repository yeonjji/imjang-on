import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { GuideCategory, PostStatus } from '@prisma/client';
import { createNewGuides } from '@/scripts/guide/create-new-guides';

const PFX = 'ut-new-';
const longBody = '본문 문장입니다. '.repeat(120);
const meta = (key: string, extra = '') =>
  `category: REALESTATE\nsourceName: 국토교통부\nsourceUrl: https://rt.molit.go.kr\nsourceExcerpt: 공개 자료\nsourceDate: 2026-11-12\ndedupeKey: ${key}\n${extra}`;
const file = (title: string, head: string, body = longBody) => `---\ntitle: ${title}\nsummary: 요약\n${head}---\n${body}\n`;

let dir: string;
beforeEach(async () => {
  await prisma.guide.deleteMany({ where: { slug: { startsWith: PFX } } });
  dir = mkdtempSync(join(tmpdir(), 'newg-'));
});
afterAll(async () => {
  await prisma.guide.deleteMany({ where: { slug: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('createNewGuides', () => {
  it('dry-run은 쓰지 않고, 메타 없는 기존 재작성본은 대상에서 뺀다', async () => {
    writeFileSync(join(dir, `${PFX}a.md`), file('새 글', meta(`${PFX}a`)));
    writeFileSync(join(dir, `${PFX}old.md`), file('옛 글', ''));
    const r = await createNewGuides({ dir, apply: false });
    expect(r.wouldCreate).toEqual([`${PFX}a`]);
    expect(await prisma.guide.count({ where: { slug: { startsWith: PFX } } })).toBe(0);
  });

  it('--apply는 DRAFT로 넣고, 다시 돌리면 이미 있는 글은 건너뛴다', async () => {
    writeFileSync(join(dir, `${PFX}a.md`), file('새 글', meta(`${PFX}a`)));
    const r = await createNewGuides({ dir, apply: true });
    expect(r.created).toEqual([`${PFX}a`]);
    const g = await prisma.guide.findUniqueOrThrow({ where: { slug: `${PFX}a` } });
    expect(g.status).toBe(PostStatus.DRAFT);
    expect(g.category).toBe(GuideCategory.REALESTATE);
    expect(g.publishedAt).toBeNull();

    const again = await createNewGuides({ dir, apply: true });
    expect(again.created).toEqual([]);
    expect(again.skipped).toEqual([{ slug: `${PFX}a`, reason: `이미 있음(${PFX}a)` }]);
  });

  it('하나라도 검증에 실패하면 아무것도 쓰지 않는다', async () => {
    writeFileSync(join(dir, `${PFX}a.md`), file('새 글', meta(`${PFX}a`)));
    writeFileSync(join(dir, `${PFX}b.md`), file('짧은 글', meta(`${PFX}b`), '짧다'));
    await expect(createNewGuides({ dir, apply: true })).rejects.toThrow(/분량/);
    expect(await prisma.guide.count({ where: { slug: { startsWith: PFX } } })).toBe(0);
  });
});
