import { describe, it, expect } from 'vitest';
import { normalizeRegister } from '@/scripts/ingest/building-register/normalize';

const m = (o: Record<string, unknown>) => ({ mainAtchGbCd: '0', strctCdNm: '철근콘크리트구조', mainPurpsCdNm: '공동주택', etcPurps: '공동주택', useAprDay: '20190830', crtnDay: '20220813', grndFlrCnt: 6, ugrndFlrCnt: 1, hhldCnt: 14, hoCnt: 0, rideUseElvtCnt: 1, emgenUseElvtCnt: 0, indrAutoUtcnt: 9, oudrAutoUtcnt: 3, indrMechUtcnt: 0, oudrMechUtcnt: 0, bcRat: 59.8, vlRat: 187.33, rserthqkDsgnApplyYn: '1', ...o });

describe('normalizeRegister', () => {
  it('빌라 단일 건물(시안 C 값)', () => {
    const r = normalizeRegister({ recap: null, mains: [m({ etcPurps: '공동주택(도시형생활주택), 제1종근린생활시설(소매점)' })] }, [{ jijiguGbCdNm: '용도지역코드', jijiguCdNm: '제2종일반주거지역', reprYn: '1' }], []);
    expect(r).toMatchObject({
      structure: '철근콘크리트구조', mainPurpose: '공동주택', groundFloors: 6, undergroundFloors: 1, mainBuildingCount: 1,
      households: 14, units: null, elevators: 1, parkingTotal: 12, bcRat: 59.8, vlRat: 187.33, seismicApplied: 1,
      zoningKind: '용도지역', zoningName: '제2종일반주거지역', hasNeighborhoodFacility: true,
    });
    expect(r.useAprDate?.toISOString().slice(0, 10)).toBe('2019-08-30');
    expect(r.registerCreatedAt?.toISOString().slice(0, 10)).toBe('2022-08-13');
  });
  it('총괄표제부 값이 있으면 우선, 0은 null', () => {
    const r = normalizeRegister(
      { recap: { hhldCnt: 938, hoCnt: 0, totPkngCnt: 1393, bcRat: 16.94, vlRat: 159.96, useAprDay: '20240423' }, mains: [m({ grndFlrCnt: 27, rideUseElvtCnt: 0, emgenUseElvtCnt: 0, bcRat: 0, vlRat: 0 }), m({ grndFlrCnt: 25, rserthqkDsgnApplyYn: '0' })] },
      [], [],
    );
    expect(r).toMatchObject({ households: 938, parkingTotal: 1393, bcRat: 16.94, vlRat: 159.96, groundFloors: 27, elevators: 1, seismicApplied: 1, mainBuildingCount: 2, zoningName: null });
  });
  it('주차는 총괄표제부가 없으면 부속건축물까지 합산', () => {
    const r = normalizeRegister({ recap: null, mains: [m({ indrAutoUtcnt: 0, oudrAutoUtcnt: 2 })] }, [], [{ mainAtchGbCd: '1', indrAutoUtcnt: 10, oudrAutoUtcnt: 0, indrMechUtcnt: 0, oudrMechUtcnt: 0 }]);
    expect(r.parkingTotal).toBe(12);
  });
  it('승강기·주차가 모두 0이면 null, 지역지구 이름이 공백이면 null', () => {
    const r = normalizeRegister({ recap: null, mains: [m({ rideUseElvtCnt: 0, indrAutoUtcnt: 0, oudrAutoUtcnt: 0 })] }, [{ jijiguGbCdNm: '용도지역코드', jijiguCdNm: ' ', reprYn: '1' }], []);
    expect(r.elevators).toBeNull();
    expect(r.parkingTotal).toBeNull();
    expect(r.zoningName).toBeNull();
  });
});
