import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { replaceLegalDongs, loadLegalDongLookup } from '@/scripts/ingest/legal-dong/load';
import { lookupKey } from '@/scripts/ingest/building-register/key';

const rows = Array.from({ length: 10 }, (_, i) => ({ code: `41111${String(13000 + i).padStart(5, '0')}`, sigunguCode: '41111', name: `테스트${i}동` }));

beforeAll(async () => {
  await prisma.legalDong.deleteMany();
});
afterAll(async () => {
  await prisma.legalDong.deleteMany();
  await prisma.$disconnect();
});

describe('replaceLegalDongs', () => {
  it('교체 적재하고 조회표를 만든다', async () => {
    expect(await replaceLegalDongs(rows)).toBe(10);
    const lookup = await loadLegalDongLookup();
    expect(lookup.get(lookupKey('41111', '테스트3동'))).toEqual(['4111113003']);
  });
  it('이전의 90% 미만이면 거부하고 기존 데이터를 지킨다', async () => {
    await expect(replaceLegalDongs(rows.slice(0, 5))).rejects.toThrow(/90%/);
    expect(await prisma.legalDong.count()).toBe(10);
  });
});
