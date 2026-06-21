import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { listPublishedPosts, getPublishedPostBySlug, getPublishedPostById, normalizeSlug, PAGE_SIZE, getBoardCategoryCounts, getBoardSourceOrgs, getHomeLatestPosts } from '@/lib/board/post';
import { BOARD_CATEGORIES } from '@/lib/board/labels';
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
  it('목록 행에 sourceName을 포함한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}src`, sourceName: '금융위원회' }) });
    const { rows } = await listPublishedPosts({ page: 1 });
    const mine = rows.find((r) => r.slug === `${MARK}src`);
    expect(mine?.sourceName).toBe('금융위원회');
  });
  it('잘못된 page 값(NaN)도 1페이지로 안전 처리한다(throw 없음)', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}nan` }) });
    const { rows } = await listPublishedPosts({ page: Number.NaN });
    expect(rows.some((r) => r.slug === `${MARK}nan`)).toBe(true);
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
describe('getPublishedPostById', () => {
  it('PUBLISHED 글을 id로 가져온다', async () => {
    const created = await prisma.post.create({ data: postData({ slug: `${MARK}byid` }), select: { id: true } });
    const post = await getPublishedPostById(created.id);
    expect(post).not.toBeNull();
    expect(post!.id).toBe(created.id);
    expect(post!.sourceName).toBe('국토교통부');
  });
  it('DRAFT 글은 null을 반환한다', async () => {
    const created = await prisma.post.create({ data: postData({ slug: `${MARK}byid-d`, status: 'DRAFT' }), select: { id: true } });
    expect(await getPublishedPostById(created.id)).toBeNull();
  });
});
describe('normalizeSlug', () => {
  it('퍼센트 인코딩된 한글을 디코드·NFC 정규화한다', () => {
    const korean = '2026-06-15-디딤돌대출'.normalize('NFC');
    expect(normalizeSlug(encodeURIComponent(korean))).toBe(korean);
  });
  it('이미 디코드된 ASCII는 그대로', () => {
    expect(normalizeSlug('2026-06-15-loan')).toBe('2026-06-15-loan');
  });
});

describe('getPublishedPostBySlug 한글 slug (라우트 인코딩 회귀)', () => {
  it('인코딩된 slug로도 NFC 저장 글을 찾는다', async () => {
    const korean = `${MARK}한글제목`.normalize('NFC');
    await prisma.post.create({ data: postData({ slug: korean, dedupeKey: `${MARK}ko` }) });
    // Next 프로덕션 라우트가 넘기는 형태(퍼센트 인코딩)로 조회
    const post = await getPublishedPostBySlug(encodeURIComponent(korean));
    expect(post).not.toBeNull();
    expect(post!.slug).toBe(korean);
  });
});

describe('PAGE_SIZE', () => { it('양의 정수다', () => { expect(PAGE_SIZE).toBeGreaterThan(0); }); });

describe('getBoardCategoryCounts', () => {
  it('모든 카테고리 키를 0 이상의 숫자로 반환한다', async () => {
    const counts = await getBoardCategoryCounts();
    for (const { value: key } of BOARD_CATEGORIES) {
      expect(typeof counts[key]).toBe('number');
      expect(counts[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('PUBLISHED 글을 카테고리별로 집계한다(증가분 단언)', async () => {
    // 공유 DB·병렬 실행을 고려해 정확값 대신 증가분(>=)으로 단언한다.
    const before = await getBoardCategoryCounts();
    await prisma.post.create({ data: postData({ slug: `${MARK}re1`, category: 'REALESTATE', status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}re2`, category: 'REALESTATE', status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}re3`, category: 'REALESTATE', status: 'DRAFT' }) });
    const after = await getBoardCategoryCounts();
    expect(after.REALESTATE - before.REALESTATE).toBeGreaterThanOrEqual(2);
  });
});

describe('getBoardSourceOrgs', () => {
  it('PUBLISHED 글의 출처기관을 distinct로 반환하고 DRAFT는 제외한다', async () => {
    // 고유 sourceName으로 격리 → 공유 DB에서도 결정적으로 검증.
    const pubOrg = `${MARK}출처PUB`;
    const draftOrg = `${MARK}출처DRAFT`;
    await prisma.post.create({ data: postData({ slug: `${MARK}o1`, sourceName: pubOrg, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}o2`, sourceName: pubOrg, status: 'PUBLISHED' }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}o3`, sourceName: draftOrg, status: 'DRAFT' }) });
    const orgs = await getBoardSourceOrgs(1000);
    expect(orgs).toContain(pubOrg);
    expect(orgs).not.toContain(draftOrg);
    expect(orgs.filter((o) => o === pubOrg)).toHaveLength(1); // distinct
  });

  it('limit으로 개수를 제한한다', async () => {
    const orgs = await getBoardSourceOrgs(3);
    expect(orgs.length).toBeLessThanOrEqual(3);
  });
});

describe('getHomeLatestPosts', () => {
  it('PUBLISHED만 노출하고 DRAFT는 제외한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-pub`, status: 'PUBLISHED', publishedAt: new Date('2999-01-02') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}home-draft`, status: 'DRAFT', publishedAt: new Date('2999-01-03') }) });
    const rows = await getHomeLatestPosts(5);
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain(`${MARK}home-pub`);
    expect(slugs).not.toContain(`${MARK}home-draft`);
  });

  it('publishedAt 내림차순으로 정렬하고 limit을 지킨다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-A`, publishedAt: new Date('2999-02-01') }) });
    await prisma.post.create({ data: postData({ slug: `${MARK}home-B`, publishedAt: new Date('2999-02-05') }) });
    const rows = await getHomeLatestPosts(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].slug).toBe(`${MARK}home-B`);
    expect(rows[1].slug).toBe(`${MARK}home-A`);
  });

  it('대표 카드용 summary를 포함한다', async () => {
    await prisma.post.create({ data: postData({ slug: `${MARK}home-sum`, summary: '홈요약텍스트', publishedAt: new Date('2999-03-01') }) });
    const rows = await getHomeLatestPosts(5);
    const mine = rows.find((r) => r.slug === `${MARK}home-sum`);
    expect(mine?.summary).toBe('홈요약텍스트');
  });

  it('기본 limit은 5 이하의 배열을 반환한다', async () => {
    const rows = await getHomeLatestPosts();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});
