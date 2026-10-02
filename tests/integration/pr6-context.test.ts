import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getParkAreaRank } from '@/lib/urban/park-context';
import { getParkingFeeComparison } from '@/lib/urban/parking-context';

// 실제 데이터와 겹치지 않게 가상 주소 접두어와 바다 좌표를 쓴다(CI check 잡은 seed를 안 한다).
const PREFIX = 'UT도 UT시';

beforeAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.park.createMany({
    data: [
      { sourceId: 'UT-PR6-P1', name: 'UT큰공원', address: `${PREFIX} 1`, parkType: '근린공원', area: 90000 },
      { sourceId: 'UT-PR6-P2', name: 'UT중간공원', address: `${PREFIX} 2`, parkType: '근린공원', area: 50000 },
      { sourceId: 'UT-PR6-P3', name: 'UT작은공원', address: `${PREFIX} 3`, parkType: '근린공원', area: 10000 },
      { sourceId: 'UT-PR6-P4', name: 'UT어린이공원', address: `${PREFIX} 4`, parkType: '어린이공원', area: 99999 },
    ],
  });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.parking.createMany({
    data: [
      { sourceId: 'UT-PR6-K1', name: 'UT공영1', address: `${PREFIX} 1`, prkplceSe: '공영', basicTime: 30, basicCharge: 500, monthCmmtkt: 60000 },
      { sourceId: 'UT-PR6-K2', name: 'UT공영2', address: `${PREFIX} 2`, prkplceSe: '공영', basicTime: 60, basicCharge: 1200, monthCmmtkt: 80000 },
      { sourceId: 'UT-PR6-K3', name: 'UT공영3', address: `${PREFIX} 3`, prkplceSe: '공영', basicTime: 30, basicCharge: 1000, monthCmmtkt: 100000 },
      { sourceId: 'UT-PR6-K4', name: 'UT공영일일', address: `${PREFIX} 4`, prkplceSe: '공영', basicTime: 1440, basicCharge: 10000 },
      { sourceId: 'UT-PR6-K5', name: 'UT민영', address: `${PREFIX} 5`, prkplceSe: '민영', basicTime: 30, basicCharge: 5000 },
    ],
  });
});

afterAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.$disconnect();
});

describe('getParkAreaRank', () => {
  it('같은 시군구·같은 유형 중 면적 순위(이 공원 포함)', async () => {
    expect(await getParkAreaRank({ parkType: '근린공원', area: 50000 }, PREFIX)).toEqual({ rank: 2, total: 3 });
  });
  it('비교 대상이 3곳 미만이면 null', async () => {
    expect(await getParkAreaRank({ parkType: '어린이공원', area: 99999 }, PREFIX)).toBeNull();
  });
  it('접두어·유형·면적이 없으면 null', async () => {
    expect(await getParkAreaRank({ parkType: '근린공원', area: 50000 }, null)).toBeNull();
    expect(await getParkAreaRank({ parkType: null, area: 50000 }, PREFIX)).toBeNull();
    expect(await getParkAreaRank({ parkType: '근린공원', area: null }, PREFIX)).toBeNull();
  });
});

describe('getParkingFeeComparison', () => {
  it('공영 주차장 30분 환산 중앙값·월정기권 중앙값(1일 요금·민영 제외)', async () => {
    const cmp = await getParkingFeeComparison({ basicTime: 30, basicCharge: 1500, monthCmmtkt: 100000 }, PREFIX);
    expect(cmp).toEqual({
      own30: 1500, median30: 600, count30: 3, // 500, 600, 1000 → 600
      ownMonthly: 100000, medianMonthly: 80000, countMonthly: 3,
    });
  });
  it('접두어가 없으면 null', async () => {
    expect(await getParkingFeeComparison({ basicTime: 30, basicCharge: 1500, monthCmmtkt: null }, '__NO_MATCH__')).toBeNull();
  });
  it('이 주차장 요금이 없으면 null', async () => {
    expect(await getParkingFeeComparison({ basicTime: null, basicCharge: null, monthCmmtkt: null }, PREFIX)).toBeNull();
  });
});
