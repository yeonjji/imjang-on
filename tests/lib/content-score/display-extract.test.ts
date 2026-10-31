import { describe, it, expect } from 'vitest';
import { hospitalDoctorRows, hospitalVisibleBeds, hospitalHasHourInfo } from '@/lib/hospital/display';
import { schoolInfoRows } from '@/lib/school-display';
import { childcareInfoRows, childcareStaffRows, childcareFacilityRows } from '@/lib/childcare';
import { parkInfoRows } from '@/lib/urban/park-display';
import { parkingHourBlocks, parkingExtrasFlags } from '@/lib/urban/parking-display';
import { chargerGuideItems } from '@/lib/urban/charger-display';

const z = { general: null, intern: null, resident: null, specialist: null };

describe('표시 판정 추출', () => {
  it('병원 의료진 행: 0·null 자격은 생략, 전부 없으면 빈 배열', () => {
    expect(hospitalDoctorRows({ med: z, dent: z, kor: z })).toEqual([]);
    expect(hospitalDoctorRows({ med: { ...z, specialist: 2, general: 0 }, dent: z, kor: z }))
      .toEqual([{ label: '의사', parts: '전문의 2명' }]);
  });
  it('병원 병상: 0보다 큰 칸만', () => {
    expect(hospitalVisibleBeds({ generalBedNormal: 10, erBed: 0 } as never).map((b) => b.key)).toEqual(['generalBedNormal']);
    expect(hospitalVisibleBeds(null)).toEqual([]);
  });
  it('병원 진료시간 표시: 요일 시간 또는 비고, 심평원 출처면 점심·휴진 문구도', () => {
    expect(hospitalHasHourInfo(null, null)).toBe(false);
    expect(hospitalHasHourInfo(null, { source: 'nemc', days: [], monday: null, note: '야간 진료', fetchedAt: null })).toBe(true);
    expect(hospitalHasHourInfo({ lunchWeekday: '12:30~13:30' } as never, null)).toBe(true);
    expect(hospitalHasHourInfo({ lunchWeekday: '12:30~13:30' } as never, { source: 'nemc', days: [], monday: null, note: null, fetchedAt: null })).toBe(false);
  });
  it('학교 기본 정보: 고교만 고교 항목 3개', () => {
    const base = { schoolKind: '중학교', foundType: '공립', coeduType: '남여공학', hsType: null, hsTrack: null, specialPurpose: null, admissionPeriod: null, foundedAt: null, anniversaryAt: null, eduOffice: '서울특별시교육청', tel: null };
    expect(schoolInfoRows(base as never)).toHaveLength(7);
    expect(schoolInfoRows({ ...base, schoolKind: '고등학교' } as never)).toHaveLength(10);
  });
  it('어린이집 기본 정보 10행(지역 포함), 운영상태 기본 정상', () => {
    const rows = childcareInfoRows({ address: 'a', tel: null, fax: null, homepage: null, repName: null, confirmDate: null, vehicleOp: null, services: null, status: null } as never, '서울 강남구');
    expect(rows).toHaveLength(10);
    expect(rows.find(([k]) => k === '운영상태')?.[1]).toBe('정상');
    expect(rows.find(([k]) => k === '인가일')?.[1]).toBe('-');
  });
  it('어린이집 교직원: 역할은 >0, 근속은 not null', () => {
    const r = childcareStaffRows({ emRoleTeacher: 3, emRoleCook: 0, emTenure0y: 0 } as never);
    expect(r.roleRows.map((x) => x.label)).toEqual(['보육교사']);
    expect(r.tenRows.map((x) => x.label)).toEqual(['1년 미만']);
  });
  it('어린이집 시설 4항목: 값 없으면 -', () => {
    const rows = childcareFacilityRows({ roomCount: 3, roomSize: null, playgroundCount: null, cctvCount: 5, staffCount: null } as never);
    expect(rows.map((r) => r.value)).toEqual(['3실', '-', '5대', '-']);
  });
  it('공원 기본 정보 6행(면적 순위 포함)', () => {
    expect(parkInfoRows({ parkType: '근린공원', area: 1000, designatedAt: null, managingOrg: null, tel: null } as never, null)).toHaveLength(6);
  });
  it('주차장 운영시간·부가 정보', () => {
    expect(parkingHourBlocks({ weekdayOpenHhmm: '09:00', weekdayCloseHhmm: null, satOpenHhmm: null, satCloseHhmm: null, holidayOpenHhmm: null, holidayCloseHhmm: null } as never).weekdayOpen).toBe('09:00');
    expect(parkingExtrasFlags({ pwdbsPpkZoneYn: false, enforceSe: null, feedingSe: null, spcmnt: '  ' } as never)).toEqual({ hasBadges: false, hasNote: false });
  });
  it('충전소 이용 안내: 타일·행', () => {
    const g = chargerGuideItems({ useTime: '24시간', parkingFree: null, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null }, []);
    expect(g.tiles.map((t) => t.label)).toEqual(['이용 시간']);
    expect(g.rows).toEqual([]);
  });
});
