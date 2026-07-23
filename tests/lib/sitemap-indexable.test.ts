import { describe, it, expect } from 'vitest';
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
