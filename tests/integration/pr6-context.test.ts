import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getParkAreaRank } from '@/lib/urban/park-context';
import { getParkingFeeComparison } from '@/lib/urban/parking-context';
import { getPharmacyDong, countSundayClinicsNearby } from '@/lib/pharmacy/context';
import { getSameDeptNearby } from '@/lib/hospital/context';

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

  // 약국(시군구 99999, UT동) 3곳, 바다 좌표 근처 병·의원
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.pharmacy.createMany({
    data: [
      { sourceId: 'UT-PR6-RX1', name: 'UT약국1', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2001-01-01T00:00:00Z') },
      { sourceId: 'UT-PR6-RX2', name: 'UT약국2', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2007-10-10T00:00:00Z') },
      { sourceId: 'UT-PR6-RX3', name: 'UT약국3', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2015-05-05T00:00:00Z') },
    ],
  });
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  const mk = (sourceId: string, name: string, typeName: string) =>
    prisma.hospital.create({ data: { sourceId, name, typeCode: '31', typeName, address: 'UT' } });
  const h1 = await mk('UT-PR6-H1', 'UT내과의원', '의원'); // 일요일·토요일·야간 진료
  const h2 = await mk('UT-PR6-H2', 'UT바다내과의원', '의원'); // 토요일만
  const h3 = await mk('UT-PR6-H3', 'UT소아청소년과의원', '의원'); // 진료시간 비공개
  const h4 = await mk('UT-PR6-H4', 'UT먼내과의원', '의원'); // 3km 밖
  await prisma.hospitalDept.createMany({
    data: [
      { hospitalId: h1.id, deptCode: '01', deptName: '내과' },
      { hospitalId: h2.id, deptCode: '01', deptName: '내과' },
      { hospitalId: h3.id, deptCode: '11', deptName: '소아청소년과' },
      { hospitalId: h4.id, deptCode: '01', deptName: '내과' },
    ],
  });
  await prisma.hospitalDetail.createMany({
    data: [
      { hospitalId: h1.id, openSun: 900, closeSun: 1300, openSat: 900, closeSat: 1300, openMon: 900, closeMon: 2100 },
      { hospitalId: h2.id, openSat: 900, closeSat: 1300, openMon: 900, closeMon: 1800 },
      { hospitalId: h4.id, openSun: 900, closeSun: 1300 },
    ],
  });
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5000, 33.0000), 4326)::geography WHERE "sourceId" IN ('UT-PR6-H1','UT-PR6-H3')`;
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5030, 33.0000), 4326)::geography WHERE "sourceId" = 'UT-PR6-H2'`;
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5400, 33.0000), 4326)::geography WHERE "sourceId" = 'UT-PR6-H4'`;
});

afterAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  // HospitalDept·HospitalDetail은 onDelete: Cascade
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
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

describe('약국 동네 맥락', () => {
  it('같은 동 약국 수와 개설 순서(이 약국 포함)', async () => {
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2007-10-10T00:00:00Z') }))
      .toEqual({ dong: 'UT동', count: 3, openedRank: 2 });
  });
  it('읍면동이 없거나 혼자면 null', async () => {
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: null, openedAt: null })).toBeNull();
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: '없는동', openedAt: null })).toBeNull();
  });
  it('도보권(500m) 일요일 진료: 진료시간 공개분 중 일요일 유효 시간대만, 3km 밖 제외', async () => {
    expect(await countSundayClinicsNearby(33.0, 124.5)).toBe(1);
  });
});

describe('getSameDeptNearby', () => {
  it('반경 1km 같은 진료과·같은 종별(이곳 포함), 진료시간 공개분 중 토요일·평일 20시 이후', async () => {
    expect(await getSameDeptNearby({ typeName: '의원' }, '내과', 33.0, 124.5)).toEqual({
      dept: '내과', typeName: '의원', total: 2, withHours: 2, saturday: 2, night: 1,
    });
  });
  it('혼자면 null', async () => {
    expect(await getSameDeptNearby({ typeName: '의원' }, '소아청소년과', 33.0, 124.5)).toBeNull();
  });
});
