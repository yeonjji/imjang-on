import { describe, it, expect } from 'vitest';
import {
  splitFacilities,
  parkFacilityGroups,
  soccerFieldCount,
  buildParkHeroLine,
} from '@/lib/urban/park-display';

describe('splitFacilities', () => {
  it('+ , / 를 모두 구분자로 쓰고 공백·빈 항목·중복을 정리한다', () => {
    expect(splitFacilities('정자,의자/음수전+ 정자 +')).toEqual(['정자', '의자', '음수전']);
  });
  it('빈 값은 빈 배열', () => {
    expect(splitFacilities(null)).toEqual([]);
    expect(splitFacilities('')).toEqual([]);
  });
});

describe('parkFacilityGroups', () => {
  it('놀이·운동·편의·교양 순서, 빈 묶음은 뺀다', () => {
    expect(
      parkFacilityGroups({
        facilitySport: '야외헬스기구',
        facilityPlay: '조합놀이대+그네',
        facilityConvenience: null,
        facilityCulture: '화장실',
      }),
    ).toEqual([
      { label: '놀이시설', items: ['조합놀이대', '그네'] },
      { label: '운동시설', items: ['야외헬스기구'] },
      { label: '교양시설', items: ['화장실'] },
    ]);
  });
  it('전부 비면 빈 배열', () => {
    expect(parkFacilityGroups({})).toEqual([]);
  });
});

describe('soccerFieldCount', () => {
  it('7,140㎡ 기준 반올림', () => {
    expect(soccerFieldCount(58462)).toBe(8);
    expect(soccerFieldCount(2950000)).toBe(413);
  });
  it('1개 미만이면 null (축구장 약 0개 금지)', () => {
    expect(soccerFieldCount(1500)).toBeNull();
    expect(soccerFieldCount(3500)).toBeNull();
  });
  it('없으면 null', () => {
    expect(soccerFieldCount(null)).toBeNull();
    expect(soccerFieldCount(0)).toBeNull();
  });
});

describe('buildParkHeroLine', () => {
  it('면적 · 축구장 · 지정 연도', () => {
    expect(buildParkHeroLine({ area: 58462, designatedAt: new Date('2016-06-17T00:00:00Z') }))
      .toBe('면적 58,462 ㎡ · 축구장 약 8개 크기 · 2016년 지정');
  });
  it('작은 공원은 축구장 문구를 뺀다', () => {
    expect(buildParkHeroLine({ area: 1500 })).toBe('면적 1,500 ㎡');
  });
  it('아무 값도 없으면 null', () => {
    expect(buildParkHeroLine({})).toBeNull();
  });
});
