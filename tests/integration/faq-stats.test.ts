import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getFaqStats, queryFaqStats } from '@/lib/faq/stats';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('queryFaqStats', () => {
  it('화면과 같은 기준으로 센다(redirect 제외 단지, 휴지 어린이집 제외, 결과 ok 공고)', async () => {
    const s = await queryFaqStats();
    const live = { redirectToId: null };
    expect(s.apt).toBe(await prisma.property.count({ where: { ...live, propertyType: 'APARTMENT' } }));
    expect(s.officetel).toBe(await prisma.property.count({ where: { ...live, propertyType: 'OFFICETEL' } }));
    expect(s.villa).toBe(await prisma.property.count({ where: { ...live, propertyType: { in: ['ROW_HOUSE', 'MULTIPLEX'] } } }));
    expect(s.subscriptionResults).toBe(await prisma.subscriptionResult.count({ where: { status: 'ok' } }));
    expect(s.childcare).toBe(await prisma.childcare.count({ where: { OR: [{ status: null }, { status: { not: '휴지' } }] } }));
    expect(s.childcarePublic).toBe(
      await prisma.childcare.count({ where: { crType: '국공립', OR: [{ status: null }, { status: { not: '휴지' } }] } }),
    );
    expect(s.evStations).toBe(await prisma.evCharger.count());
    expect(s.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // unstable_cache는 JSON 직렬화 — BigInt가 섞이면 안 된다
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});

describe('getFaqStats', () => {
  it('Next 캐시 밖(테스트)에서도 직접 조회로 값을 돌려준다', async () => {
    const s = await getFaqStats();
    expect(s).not.toBeNull();
    expect(typeof s!.apt).toBe('number');
  });
});
