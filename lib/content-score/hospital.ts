// 병원 상세 내용 점수(최대 22) — 설계 §3.2. 판정은 상세 탭과 같은 함수(lib/hospital/display).
import type { HospitalWithRelations } from '@/lib/hospital';
import { effectiveHours } from '@/lib/hospital/hours';
import { hospitalDoctorRows, hospitalDoctorsFrom, hospitalVisibleBeds, hospitalHasHourInfo } from '@/lib/hospital/display';
import { type Breakdown, tier, nearbyPoints } from './core';

export interface HospitalCounts {
  depts: number; equipment: number; specialties: number; specialTreatments: number;
  nursingGrades: number; staff: number; transits: number; mealSurcharges: number;
}

export type HospitalScoreInput = Pick<HospitalWithRelations,
  'totalDoctors' | 'midwifeCount' | 'facility' | 'detail' | 'nemcHours' |
  'drMedGeneral' | 'drMedIntern' | 'drMedResident' | 'drMedSpecialist' |
  'drDentGeneral' | 'drDentIntern' | 'drDentResident' | 'drDentSpecialist' |
  'drKorGeneral' | 'drKorIntern' | 'drKorResident' | 'drKorSpecialist'> & { counts: HospitalCounts; hasLocation: boolean };

export function ownHospital(h: HospitalScoreInput): Breakdown {
  const hours = effectiveHours(h.detail, h.nemcHours);
  const hoursView = hours ? { source: hours.source, days: hours.days, monday: hours.monday, note: hours.note, fetchedAt: hours.fetchedAt } : null;
  const doctorShown = hospitalDoctorRows(hospitalDoctorsFrom(h)).length > 0 || (h.midwifeCount ?? 0) > 0;
  // 시설 카드는 설립구분이나 0보다 큰 병상이 있어야 내용이 보인다(병상 0뿐이면 빈 표).
  const facilityShown = !!h.facility && (!!h.facility.foundTypeName || hospitalVisibleBeds(h.facility).length > 0);
  const c = h.counts;
  return {
    depthDepts: tier(c.depts, [1, 4]),
    depthDoctors: tier(h.totalDoctors, [1, 5]),
    depts: c.depts > 0 ? 2 : 0,
    doctors: doctorShown ? 2 : 0,
    hours: hospitalHasHourInfo(h.detail, hoursView) ? 2 : 0,
    facility: facilityShown ? 1 : 0,
    equipment: c.equipment > 0 ? 1 : 0,
    specialty: c.specialties + c.specialTreatments > 0 ? 1 : 0,
    nursing: c.nursingGrades > 0 ? 1 : 0,
    staff: c.staff > 0 ? 1 : 0,
    er: h.detail && (h.detail.erDayOpen != null || h.detail.erNightOpen != null) ? 1 : 0,
    parking: h.detail?.parkingCapacity != null ? 1 : 0,
    transit: c.transits > 0 ? 1 : 0,
    meal: c.mealSurcharges > 0 ? 1 : 0,
    map: h.hasLocation ? 1 : 0,
  };
}

/** 주간: 같은 진료과 비교·주변 아파트·지하철·생활 인프라(합계 최대 2) */
export function weeklyHospital(f: { sameDept: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.sameDept, f.apts, f.subway, f.infra]) };
}
