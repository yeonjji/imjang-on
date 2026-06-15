import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { createDraft, type CreateDraftInput } from '@/lib/board/create-draft';

assertLocalDatabase();
const MARK = 'test-cd-';

function input(over: Partial<CreateDraftInput> = {}): CreateDraftInput {
  return {
    gen: { type: 'PROGRAM', category: 'LOAN', title: '검토용', summary: '요약', body: '국토부는 발표했다. '.repeat(180) },
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'), sourceExcerpt: '원문',
    dedupeKey: `${MARK}k1`, dateISO: '2026-06-15', detectedFrom: '뉴스키워드',
    ...over,
  };
}
beforeEach(async () => { await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } }); });
afterEach(async () => { await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } }); });

describe('createDraft', () => {
  it('가드레일 통과 시 DRAFT를 만들고 status=created', async () => {
    const r = await createDraft(input());
    expect(r.status).toBe('created');
    const row = await prisma.post.findUnique({ where: { dedupeKey: `${MARK}k1` } });
    expect(row!.status).toBe('DRAFT');
    expect(row!.slug.startsWith('2026-06-15-')).toBe(true);
  });
  it('가드레일 실패(금지표현)면 만들지 않고 status=rejected', async () => {
    const r = await createDraft(input({ gen: { type: 'TREND', category: 'ECONOMY', title: 't', summary: 's', body: '상승할 것으로 보입니다. '.repeat(180) } }));
    expect(r.status).toBe('rejected');
    expect(await prisma.post.findUnique({ where: { dedupeKey: `${MARK}k1` } })).toBeNull();
  });
  it('dedupeKey 중복이면 status=duplicate', async () => {
    await createDraft(input());
    const r = await createDraft(input());
    expect(r.status).toBe('duplicate');
  });
});
