import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { replaceSnapshot } from '@/scripts/ingest/loan/runner';
import type { LoanProductRow } from '@/scripts/ingest/loan/types';

const rowsA: LoanProductRow[] = [
  { seq: 8, finprdnm: '사잇돌Ⅱ', ofrinstnm: 'SGI서울보증', instCtg: '민간기업', lnlmt: 2000, irt: '~19.99', irtCtg: '변동금리', usageTags: ['생계'], targetTags: ['근로자'], regionTags: ['전국'], rawJson: { seq: 8 } },
  { seq: 12, finprdnm: '저소득주민 융자', ofrinstnm: '강원도 영월군', instCtg: '지자체', lnlmt: 3000, irt: '0', irtCtg: '고정금리', usageTags: ['주거'], targetTags: ['무주택세대주'], regionTags: ['강원'], rawJson: { seq: 12 } },
];

beforeEach(async () => {
  await prisma.loanProduct.deleteMany({});
});
afterAll(async () => {
  await prisma.loanProduct.deleteMany({});
  await prisma.$disconnect();
});

describe('replaceSnapshot', () => {
  it('교체 후 재실행해도 개수가 일정하다(멱등)', async () => {
    await replaceSnapshot(rowsA);
    expect(await prisma.loanProduct.count()).toBe(2);
    await replaceSnapshot(rowsA);
    expect(await prisma.loanProduct.count()).toBe(2);
  });
  it('빈 배열이면 거부하고 기존 스냅샷 유지', async () => {
    await replaceSnapshot(rowsA);
    await expect(replaceSnapshot([])).rejects.toThrow();
    expect(await prisma.loanProduct.count()).toBe(2);
  });
});
