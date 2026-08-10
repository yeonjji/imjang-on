import { describe, it, expect } from 'vitest';
import {
  isPropertyIndexable, PROPERTY_INDEXABLE_WHERE,
  PROPERTY_MIN_SALE_12M, PROPERTY_MIN_TX_TOTAL,
} from '@/lib/property';
import { buildChildcareNarrative } from '@/lib/insights/childcare';
import { buildHospitalNarrative } from '@/lib/insights/hospital';

// 프록시 WHERE를 '겨우' 만족하는 최소 입력이 색인(fired≥3 + requireKey)됨을 증명 →
// sitemap 등재 조건 ⊆ 페이지 색인 게이트(noindex URL 0건).
describe('sitemap 프록시 ⊆ 색인 게이트', () => {
  it('childcare 프록시 최소 입력(capacity≥1·currentCount≥1·roomSize·cctv≥1) → 색인', () => {
    const n = buildChildcareNarrative({
      name: 'X', crType: null, capacity: 1, currentCount: 1,
      emRoleTeacher: null, sigunguFillMedian: null,
      waitByAge: [], roomSize: 10, cctvCount: 1, vehicleOp: null,
      nearestStation: null, infra: [], nearbyAptSaleManwon: [],
    });
    expect(n).not.toBeNull();
    expect(n!.fired.length).toBeGreaterThanOrEqual(3);
    expect(n!.fired).toEqual(expect.arrayContaining(['intro', 'occupancy', 'facility']));
  });

  it('hospital 프록시 최소 입력(totalDoctors≥1·전문의 배치 진료과) → 색인', () => {
    const n = buildHospitalNarrative({
      name: 'Y', typeName: '병원', deptCount: 1, deptWithSpecialistCount: 1,
      topDeptNames: ['내과'], totalDoctors: 1, specialistTotal: 1, bedCounts: [],
      nearestStation: null, infra: [], nearbyAptSaleManwon: [],
    });
    expect(n).not.toBeNull();
    expect(n!.fired.length).toBeGreaterThanOrEqual(3);
    expect(n!.fired).toEqual(expect.arrayContaining(['intro', 'depts', 'doctors']));
  });
});

describe('매물 색인 게이트 — 사이트맵 WHERE ↔ 행 판정 정합 (D2)', () => {
  // 사이트맵 등재 조건과 페이지 robots가 갈라지면 '제출됐지만 noindex' 경고가 난다.
  // 그 경고를 없애려던 것이 29e6fdb에서 사이트맵의 매물을 0으로 만든 원인이었다.
  const row = (o: Partial<Parameters<typeof isPropertyIndexable>[0]>) => ({
    redirectToId: null, saleCount12m: 0, txCountTotal: 0, ...o,
  });

  it('12개월 매매가 임계 이상이면 색인', () => {
    expect(isPropertyIndexable(row({ saleCount12m: PROPERTY_MIN_SALE_12M }))).toBe(true);
    expect(isPropertyIndexable(row({ saleCount12m: PROPERTY_MIN_SALE_12M - 1 }))).toBe(false);
  });

  it('전체기간 거래가 임계 이상이면 12개월이 0이어도 색인 — 상세의 거래표·층프리미엄은 전체기간 기준', () => {
    expect(isPropertyIndexable(row({ txCountTotal: PROPERTY_MIN_TX_TOTAL }))).toBe(true);
    expect(isPropertyIndexable(row({ txCountTotal: PROPERTY_MIN_TX_TOTAL - 1 }))).toBe(false);
  });

  it('redirect된 매물은 자체가 301이므로 어떤 조건이어도 제외', () => {
    expect(isPropertyIndexable(row({ redirectToId: 1n, saleCount12m: 999, txCountTotal: 999 }))).toBe(false);
  });

  it('WHERE와 행 판정이 같은 상수를 읽는다', () => {
    // 두 표현이 갈라지지 않도록 상수 출처를 하나로 묶어 둔 것을 고정한다.
    expect(PROPERTY_INDEXABLE_WHERE.redirectToId).toBeNull();
    expect(PROPERTY_INDEXABLE_WHERE.OR).toEqual([
      { saleCount12m: { gte: PROPERTY_MIN_SALE_12M } },
      { txCountTotal: { gte: PROPERTY_MIN_TX_TOTAL } },
    ]);
  });
});
