// 어린이집 상세 내용 점수(최대 14) — 설계 §3.4
import type { Childcare } from '@prisma/client';
import { childcareInfoRows, childcareStaffRows, childcareFacilityRows } from '@/lib/childcare';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownChildcare(c: Childcare, hasLocation: boolean): Breakdown {
  // '지역'은 지역 이름이라 시설 정보가 아니다 — 9항목만 센다.
  const info = childcareInfoRows(c, '').filter(([k]) => k !== '지역');
  const infoFilled = info.filter(([, v]) => filled(v)).length;
  const fac = childcareFacilityRows(c).filter((r) => filled(r.value)).length;
  const staff = childcareStaffRows(c);
  return {
    depthInfo: tier(infoFilled, [4, 6, 8]),
    depthFacility: fac >= 3 ? 1 : 0,
    ages: c.classCntTot != null || c.childCntTot != null ? 2 : 0,
    staff: staff.roleRows.length + staff.tenRows.length > 0 ? 2 : 0,
    facility: fac > 0 ? 2 : 0,
    wait: c.waitCntTot != null && c.waitCntTot > 0 ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

export function weeklyChildcare(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.childcare, f.apts, f.subway, f.infra]) };
}
