import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getParkAreaRank } from '@/lib/urban/park-context';

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
});

afterAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
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
