import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { createGuideDraft } from '@/lib/guide/create-draft';
import { GuideCategory } from '@prisma/client';
import type { GuideSeed } from '@/lib/guide/seeds';

const seed: GuideSeed = {
  key: '__test__guide_create',
  category: GuideCategory.REALESTATE,
  title: '테스트 가이드 실거래가 읽는 법',
  angle: '테스트',
  source: { name: '국토교통부', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '실거래가 공개' },
};
const goodBody = '실거래가는 실제 신고된 거래 가격입니다. '.repeat(60); // 가드레일 통과(공백제외 ~1080자, 800~6000 범위, 금지표현 없음)

afterAll(async () => {
  await prisma.guide.deleteMany({ where: { dedupeKey: { in: ['__test__guide_create'] } } });
});

describe('createGuideDraft (integration)', () => {
  it('초안을 DRAFT로 생성한다', async () => {
    await prisma.guide.deleteMany({ where: { dedupeKey: '__test__guide_create' } });
    const res = await createGuideDraft(seed, { title: seed.title, summary: '요약', body: goodBody });
    expect(res.status).toBe('created');
    if (res.status === 'created') {
      const row = await prisma.guide.findUnique({ where: { id: res.id } });
      expect(row?.status).toBe('DRAFT');
      expect(row?.category).toBe(GuideCategory.REALESTATE);
      expect(row?.dedupeKey).toBe('__test__guide_create');
    }
  });
  it('같은 dedupeKey면 duplicate', async () => {
    const res = await createGuideDraft(seed, { title: seed.title, summary: '요약', body: goodBody });
    expect(res.status).toBe('duplicate');
  });
  it('가드레일 위반(투자권유)이면 rejected', async () => {
    const seed2: GuideSeed = { ...seed, key: '__test__guide_reject' };
    const res = await createGuideDraft(seed2, { title: '나쁜 가이드', summary: 's', body: '지금이 기회입니다 ' + goodBody });
    expect(res.status).toBe('rejected');
    await prisma.guide.deleteMany({ where: { dedupeKey: '__test__guide_reject' } });
  });
});
