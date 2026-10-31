import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getParkAreaRank, parkAreaRankTotals, parkAreaRankShown } from '@/lib/urban/park-context';
import { getParkingFeeComparison, parkingFeeComparables, parkingFeeCompareShown } from '@/lib/urban/parking-context';
import { feeCompareShown } from '@/lib/content-score/parking';

// 주간 배치는 공원·주차장마다 비교 쿼리를 부르지 않고 지역 접두어별 1회 집계로 판정한다(운영 첫 weekly에서 주차장
// 단계가 DB CPU를 3분 넘게 점유). 상세 화면이 쓰는 함수와 결과가 **완전히 같아야** 한다.
const A = 'UTP도 UTP시';
const B = 'UTP도 UTQ시';

beforeAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
  await prisma.park.createMany({
    data: [
      // A: 근린공원 3곳(순위 성립), 어린이공원 2곳(미성립), 면적 없는 1곳, 유형 없는 1곳
      { sourceId: 'UT-PFX-P1', name: 'p1', address: `${A} 1`, parkType: '근린공원', area: 9000 },
      { sourceId: 'UT-PFX-P2', name: 'p2', address: `${A} 2`, parkType: '근린공원', area: 5000 },
      { sourceId: 'UT-PFX-P3', name: 'p3', address: `${A} 3`, parkType: '근린공원', area: 1000 },
      { sourceId: 'UT-PFX-P4', name: 'p4', address: `${A} 4`, parkType: '어린이공원', area: 300 },
      { sourceId: 'UT-PFX-P5', name: 'p5', address: `${A} 5`, parkType: '어린이공원', area: 200 },
      { sourceId: 'UT-PFX-P6', name: 'p6', address: `${A} 6`, parkType: '근린공원', area: null },
      { sourceId: 'UT-PFX-P7', name: 'p7', address: `${A} 7`, parkType: null, area: 700 },
      // 접두어 뒤 공백 없는 주소(그룹 밖)
      { sourceId: 'UT-PFX-P8', name: 'p8', address: `${A}동 8`, parkType: '근린공원', area: 800 },
      { sourceId: 'UT-PFX-P9', name: 'p9', address: `${B} 1`, parkType: '근린공원', area: 100 },
    ],
  });
  await prisma.parking.createMany({
    data: [
      // A: 30분 환산 가능 공영 3곳 + 월정기 2곳, 민영 1곳(비교 제외), 무료 1곳
      { sourceId: 'UT-PFX-K1', name: 'k1', address: `${A} 1`, prkplceSe: '공영', basicTime: 30, basicCharge: 500, monthCmmtkt: 60000 },
      { sourceId: 'UT-PFX-K2', name: 'k2', address: `${A} 2`, prkplceSe: '공영', basicTime: 60, basicCharge: 1200, monthCmmtkt: 80000 },
      { sourceId: 'UT-PFX-K3', name: 'k3', address: `${A} 3`, prkplceSe: '공영', basicTime: 10, basicCharge: 300 },
      { sourceId: 'UT-PFX-K4', name: 'k4', address: `${A} 4`, prkplceSe: '민영', basicTime: 30, basicCharge: 3000, monthCmmtkt: 200000 },
      { sourceId: 'UT-PFX-K5', name: 'k5', address: `${A} 5`, prkplceSe: '공영', chargeInfo: '무료' },
      { sourceId: 'UT-PFX-K6', name: 'k6', address: `${A} 6`, prkplceSe: '공영', basicTime: 1440, basicCharge: 10000 },
      { sourceId: 'UT-PFX-K7', name: 'k7', address: `${B} 1`, prkplceSe: '공영', basicTime: 30, basicCharge: 700, monthCmmtkt: 50000 },
    ],
  });
});

afterAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
  await prisma.$disconnect();
});

describe('지역 접두어 집계 = 상세 화면 함수', () => {
  it('공원 면적 순위 표시 여부가 getParkAreaRank와 같다(접두어 A·B·없음·불일치)', async () => {
    const parks = await prisma.park.findMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
    let shown = 0;
    for (const prefix of [A, B, null, '__NO_MATCH__']) {
      const totals = prefix && prefix !== '__NO_MATCH__' ? await parkAreaRankTotals(prefix) : new Map<string, number>();
      for (const p of parks) {
        const old = (await getParkAreaRank(p, prefix)) !== null;
        expect(parkAreaRankShown(p, prefix, totals), `${p.sourceId} @ ${prefix}`).toBe(old);
        if (old) shown++;
      }
    }
    expect(shown).toBe(3); // A의 근린공원 3곳만
  });
  it('주차장 요금 비교 표시 여부가 getParkingFeeComparison + feeCompareShown과 같다', async () => {
    const lots = await prisma.parking.findMany({ where: { sourceId: { startsWith: 'UT-PFX-' } } });
    let shown = 0;
    for (const prefix of [A, B, null, '__NO_MATCH__']) {
      const comps = prefix && prefix !== '__NO_MATCH__' ? await parkingFeeComparables(prefix) : { count30: 0, countMonthly: 0 };
      for (const r of lots) {
        const old = feeCompareShown(await getParkingFeeComparison(r, prefix));
        expect(parkingFeeCompareShown(r, prefix, comps), `${r.sourceId} @ ${prefix}`).toBe(old);
        if (old) shown++;
      }
    }
    expect(shown).toBeGreaterThan(0);
  });
});
