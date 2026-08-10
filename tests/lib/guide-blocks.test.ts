import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getHospitalByType } from '@/lib/guide/blocks/hospital-by-type';
import { getChildcareByType } from '@/lib/guide/blocks/childcare-by-type';
import { getChildcareWaitlist } from '@/lib/guide/blocks/childcare-waitlist';
import { getChargerMix } from '@/lib/guide/blocks/charger-mix';

const IDS = ['UT-GB-1', 'UT-GB-2'];

beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.childcare.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.evCharger.deleteMany({ where: { sourceId: { in: IDS } } });

  await prisma.hospital.createMany({
    data: [
      { sourceId: 'UT-GB-1', name: '유닛종합', typeCode: 'UT01', typeName: '유닛테스트종합병원', address: '서울 마포', totalDoctors: 100 },
      { sourceId: 'UT-GB-2', name: '유닛의원', typeCode: 'UT01', typeName: '유닛테스트종합병원', address: '서울 마포', totalDoctors: 50 },
    ],
  });
  await prisma.childcare.createMany({
    data: [
      // 대기자 합계가 크므로 take: 10 필터링이 있어도 항상 상위에 포함되어 앰비언트 데이터 의존 제거
      { sourceId: 'UT-GB-1', name: '유닛어린이집1', crType: '유닛테스트유형', address: '서울 마포', sigunguCode: '11440', sido: '서울특별시', sigungu: '유닛구', capacity: 100, currentCount: 80, waitCntTot: 50000 },
      { sourceId: 'UT-GB-2', name: '유닛어린이집2', crType: '유닛테스트유형', address: '서울 마포', sigunguCode: '11440', sido: '서울특별시', sigungu: '유닛구', capacity: 50, currentCount: 20, waitCntTot: 30000 },
    ],
  });
  await prisma.evCharger.createMany({
    data: [
      { sourceId: 'UT-GB-1', name: '유닛충전1', address: '서울 마포', chargeSpeed: '유닛급속', chargerCount: 3 },
      { sourceId: 'UT-GB-2', name: '유닛충전2', address: '서울 마포', chargeSpeed: '유닛급속', chargerCount: 2 },
    ],
  });
});

afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.childcare.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.evCharger.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.$disconnect();
});

describe('guide 데이터 블록 집계', () => {
  it('병원 종별: 개수와 평균 의사수 + 기준일', async () => {
    const result = await getHospitalByType();
    const row = result.rows.find((r) => r.typeName === '유닛테스트종합병원');
    expect(row).toMatchObject({ count: 2, avgDoctors: 75 });
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('어린이집 유형별: 개수와 평균 정원·현원 + 기준일', async () => {
    const result = await getChildcareByType();
    const row = result.rows.find((r) => r.crType === '유닛테스트유형');
    expect(row).toMatchObject({ count: 2, avgCapacity: 75, avgCurrent: 50 });
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('어린이집 대기자: 지역별 합계와 시설 수 + 기준일', async () => {
    const result = await getChildcareWaitlist();
    const row = result.rows.find((r) => r.sigungu === '유닛구');
    expect(row).toMatchObject({ sido: '서울특별시', waitTotal: 80000, facilities: 2 });
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('충전소: 속도별 지점 수와 충전기 수 + 기준일', async () => {
    const result = await getChargerMix();
    const row = result.rows.find((r) => r.chargeSpeed === '유닛급속');
    expect(row).toMatchObject({ stations: 2, chargers: 5 });
    expect(result.asOf).toBeInstanceOf(Date);
  });
});
