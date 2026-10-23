import { describe, it, expect, afterAll, vi } from 'vitest';
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
    // 목록과 같은 필터(lib/childcare.ts buildChildcareWhere 기본값)
    const ccLive = { OR: [{ status: { in: ['정상', '재개'] } }, { status: null }] };
    expect(s.childcare).toBe(await prisma.childcare.count({ where: ccLive }));
    expect(s.childcarePublic).toBe(await prisma.childcare.count({ where: { crType: '국공립', ...ccLive } }));
    // 병원·약국 목록은 sigunguCode 있는 행만
    expect(s.hospitals).toBe(await prisma.hospital.count({ where: { sigunguCode: { not: null } } }));
    expect(s.pharmacies).toBe(await prisma.pharmacy.count({ where: { sigunguCode: { not: null } } }));
    // '공영' 주차장만(주차장 표에는 민영도 있다)
    expect(s.publicParkings).toBe(await prisma.parking.count({ where: { prkplceSe: { contains: '공영' } } }));
    // 청약홈 공고만(LH 사전청약 제외)
    expect(s.subscriptionNotices).toBe(await prisma.subscriptionNotice.count({ where: { source: 'APPLYHOME' } }));
    // 관리비 섹션이 보이는 단지: 단지와 연결되고 공용관리비가 있는 kaptCode
    const [mc] = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT count(DISTINCT m."kaptCode") AS c FROM "AptMaintenanceCost" m
      JOIN "AptComplex" a ON a."kaptCode" = m."kaptCode" WHERE a."propertyId" IS NOT NULL AND m."commonTotal" > 0`;
    expect(s.maintenanceComplexes).toBe(Number(mc.c));
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

describe('getFaqStats 실패', () => {
  it('DB 오류면 null(숫자 없는 문장으로)', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('db down'));
    try {
      expect(await getFaqStats()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
