import { describe, it, expect } from 'vitest';
import { sum } from '@/lib/content-score/core';
import { ownHospital, weeklyHospital } from '@/lib/content-score/hospital';
import { ownPharmacy, weeklyPharmacy } from '@/lib/content-score/pharmacy';
import { ownChildcare, weeklyChildcare } from '@/lib/content-score/childcare';
import { ownSchool, weeklySchool } from '@/lib/content-score/school';

const dr0 = { drMedGeneral: null, drMedIntern: null, drMedResident: null, drMedSpecialist: null, drDentGeneral: null, drDentIntern: null, drDentResident: null, drDentSpecialist: null, drKorGeneral: null, drKorIntern: null, drKorResident: null, drKorSpecialist: null };
const zeroCounts = { depts: 0, equipment: 0, specialties: 0, specialTreatments: 0, nursingGrades: 0, staff: 0, transits: 0, mealSurcharges: 0 };
const emptyHospital = { ...dr0, totalDoctors: null, midwifeCount: null, facility: null, detail: null, nemcHours: null, counts: zeroCounts, hasLocation: false };

describe('병원 점수(최대 22)', () => {
  it('정보 없음 → 0', () => {
    expect(sum(ownHospital(emptyHospital as never))).toBe(0);
    expect(sum(weeklyHospital({ sameDept: false, apts: false, subway: false, infra: false }))).toBe(0);
  });
  it('병상 0개뿐인 시설 정보는 0점(빈 표)', () => {
    expect(ownHospital({ ...emptyHospital, facility: { foundTypeName: null, generalBedNormal: 0 } } as never).facility).toBe(0);
    expect(ownHospital({ ...emptyHospital, facility: { foundTypeName: '법인' } } as never).facility).toBe(1);
  });
  it('모든 블록 → 22', () => {
    const full = {
      ...dr0, drMedSpecialist: 12, totalDoctors: 12, midwifeCount: 0,
      facility: { foundTypeName: '법인', generalBedNormal: 100 },
      detail: { openMon: 900, closeMon: 1800, erDayOpen: 'Y', erNightOpen: null, parkingCapacity: 30, lunchWeekday: null, lunchSaturday: null, closedSunday: null, closedHoliday: null },
      nemcHours: null,
      counts: { depts: 8, equipment: 2, specialties: 1, specialTreatments: 0, nursingGrades: 1, staff: 3, transits: 2, mealSurcharges: 1 },
      hasLocation: true,
    };
    expect(sum(ownHospital(full as never)) + sum(weeklyHospital({ sameDept: true, apts: true, subway: true, infra: true }))).toBe(22);
  });
});

describe('약국 점수(최대 9)', () => {
  it('전부 → 9, 주변은 2점 상한', () => {
    const p = { typeName: '약국', openedAt: new Date('2010-01-01T00:00:00Z'), tel: '02', zipcode: '1', sido: '서울', sigungu: '강남구', eupmyeondong: '역삼동', hasLocation: true };
    expect(sum(ownPharmacy(p, 2026)) + sum(weeklyPharmacy({ dong: true, sunday: true, apts: true, subway: true, infra: true }))).toBe(9);
  });
  it('기본 정보 2행 이하 → 깊이 0', () => {
    expect(ownPharmacy({ typeName: '약국', openedAt: null, tel: '02', zipcode: null, sido: null, sigungu: null, eupmyeondong: null, hasLocation: false }, 2026).depth).toBe(0);
  });
});

const cc0 = { address: 'a', tel: null, fax: null, homepage: null, repName: null, confirmDate: null, vehicleOp: null, services: null, status: null, roomCount: null, roomSize: null, playgroundCount: null, cctvCount: null, staffCount: null, classCntTot: null, childCntTot: null, waitCntTot: null };

describe('어린이집 점수(최대 14)', () => {
  it('시설 전부 - 이면 시설 0점', () => {
    expect(ownChildcare(cc0 as never, false).facility).toBe(0);
  });
  it('전부 → 14', () => {
    const c = { ...cc0, tel: '02', fax: '02', homepage: 'h', repName: 'r', confirmDate: new Date(), vehicleOp: '운영', services: '일반', status: '정상', roomCount: 3, playgroundCount: 1, cctvCount: 5, staffCount: 4, classCntTot: 3, childCntTot: 40, waitCntTot: 2, emRoleTeacher: 4 };
    expect(sum(ownChildcare(c as never, true)) + sum(weeklyChildcare({ childcare: true, apts: true, subway: true, infra: true }))).toBe(14);
  });
});

const sc0 = { schoolKind: '고등학교', foundType: null, coeduType: null, hsType: null, hsTrack: null, specialPurpose: null, admissionPeriod: null, foundedAt: null, anniversaryAt: null, eduOffice: null, tel: null, homepage: null };

describe('학교 점수(고교 최대 9, 초·중 최대 8)', () => {
  it('고교 전부 → 9', () => {
    const s = { ...sc0, foundType: '공립', coeduType: '남여공학', hsType: '일반고', specialPurpose: '과학', admissionPeriod: '전기', foundedAt: new Date(), anniversaryAt: new Date(), eduOffice: '교육청', tel: '02', homepage: 'h' };
    expect(sum(ownSchool(s as never, true)) + sum(weeklySchool({ childcare: true, apts: true, subway: true, infra: true }))).toBe(9);
  });
  it('중학교는 고교 블록 없음 → 최대 8', () => {
    const s = { ...sc0, schoolKind: '중학교', foundType: '공립', coeduType: '남여공학', foundedAt: new Date(), anniversaryAt: new Date(), eduOffice: '교육청', tel: '02' };
    expect(sum(ownSchool(s as never, true)) + sum(weeklySchool({ childcare: true, apts: true, subway: true, infra: true }))).toBe(8);
  });
});
