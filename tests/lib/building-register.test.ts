import { describe, it, expect } from 'vitest';
import { buildBuildingView, type BuildingRegisterRow } from '@/lib/insights/building-register';

const NOW = new Date('2026-10-20T00:00:00Z');
const base: BuildingRegisterRow = {
  useAprDate: null, structure: '철근콘크리트구조', mainPurpose: null, etcPurpose: null, groundFloors: null, undergroundFloors: null,
  mainBuildingCount: 1, households: null, units: null, elevators: null, parkingTotal: null, bcRat: null, vlRat: null,
  seismicApplied: 0, zoningKind: null, zoningName: null, hasNeighborhoodFacility: false,
  registerCreatedAt: new Date('2022-08-13T00:00:00Z'), fetchedAt: new Date('2026-10-20T03:00:00Z'),
};
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('buildBuildingView', () => {
  it('아파트(시안 A): 단지 정보와 겹치지 않는 항목만', () => {
    const v = buildBuildingView({ ...base, bcRat: 16.94, vlRat: 159.96, seismicApplied: 15, mainBuildingCount: 15, zoningKind: '용도구역', zoningName: '지구단위계획구역', groundFloors: 27, undergroundFloors: 1, households: 938, parkingTotal: 1393, useAprDate: d('2024-04-23') }, 'APARTMENT', NOW)!;
    expect(v.tiles.map((t) => [t.label, t.value, t.sub])).toEqual([
      ['건폐율', '16.94%', '대지 중 건물이 덮은 비율'],
      ['용적률', '159.96%', '대지 대비 연면적'],
      ['내진설계', '15개 동 적용', '주건축물 15개 동 중'],
    ]);
    expect(v.rows.map((r) => [r.label, r.value, r.note ?? null])).toEqual([
      ['지역지구', '지구단위계획구역', '(용도구역)'],
      ['구조', '철근콘크리트구조', null],
      ['최고층', '지상 27층 · 지하 1층', null],
    ]);
    expect(v.formula).toBeNull();
    expect(v.neighborhoodNotice).toBe(false);
  });

  it('오피스텔(시안 B): 호당 주차·연차·주용도', () => {
    const v = buildBuildingView({ ...base, useAprDate: d('2020-03-27'), groundFloors: 10, undergroundFloors: 2, units: 697, parkingTotal: 660, elevators: 17, bcRat: 59.9, vlRat: 396.26, mainPurpose: '업무시설', etcPurpose: '업무시설(오피스텔),근린생활시설', zoningKind: '용도지역', zoningName: '준주거지역', seismicApplied: 1, hasNeighborhoodFacility: true }, 'OFFICETEL', NOW)!;
    expect(v.tiles.map((t) => [t.label, t.value, t.sub ?? null])).toEqual([
      ['사용승인', '6년차', '2020년 3월'],
      ['규모', '지상 10층', '지하 2층 · 697호'],
      ['주차', '호당 0.95대', '총 660대'],
      ['승강기', '17대', null],
      ['건폐율', '59.9%', null],
      ['용적률', '396.26%', null],
    ]);
    expect(v.rows.map((r) => r.label)).toEqual(['주용도', '지역지구', '구조', '내진설계']);
    expect(v.rows[0]).toEqual({ label: '주용도', value: '업무시설', note: '기타: 업무시설(오피스텔),근린생활시설' });
    expect(v.formula).toBe('호당 주차 = 총 주차대수 ÷ 호수');
    expect(v.neighborhoodNotice).toBe(false); // 근생 안내는 빌라만
  });

  it('빌라(시안 C): 세대당 주차와 근린생활시설 안내', () => {
    const v = buildBuildingView({ ...base, useAprDate: d('2019-08-30'), groundFloors: 6, undergroundFloors: 1, households: 14, parkingTotal: 12, elevators: 1, bcRat: 59.8, vlRat: 187.33, mainPurpose: '공동주택', seismicApplied: 1, hasNeighborhoodFacility: true }, 'MULTIPLEX', NOW)!;
    expect(v.tiles.find((t) => t.label === '주차')).toEqual({ label: '주차', value: '세대당 0.86대', sub: '총 12대' });
    expect(v.tiles.find((t) => t.label === '규모')!.sub).toBe('지하 1층 · 14세대');
    expect(v.formula).toBe('세대당 주차 = 총 주차대수 ÷ 세대수');
    expect(v.neighborhoodNotice).toBe(true);
  });

  it('세대·호수가 없으면 총 주차대수만, 내진 0이면 행 없음(미적용이라 쓰지 않는다)', () => {
    const v = buildBuildingView({ ...base, parkingTotal: 12, groundFloors: 3 }, 'ROW_HOUSE', NOW)!;
    expect(v.tiles.find((t) => t.label === '주차')).toEqual({ label: '주차', value: '총 12대' });
    expect(v.formula).toBeNull();
    expect(v.rows.some((r) => r.label === '내진설계')).toBe(false);
  });

  it('아파트에서 보여줄 것이 없으면 null', () => {
    expect(buildBuildingView({ ...base, structure: null }, 'APARTMENT', NOW)).toBeNull();
  });

  it('출처 날짜', () => {
    const v = buildBuildingView({ ...base, groundFloors: 3 }, 'ROW_HOUSE', NOW)!;
    expect(v.createdLabel).toBe('2022-08-13');
    expect(v.fetchedLabel).toBe('2026-10-20');
  });

  it('내진: 모든 동이 적용일 때만 "몇 개 동 중"(일부만이면 미적용으로 읽히지 않게)', () => {
    const all = buildBuildingView({ ...base, seismicApplied: 15, mainBuildingCount: 15 }, 'APARTMENT', NOW)!;
    expect(all.tiles.find((t) => t.label === '내진설계')).toEqual({ label: '내진설계', value: '15개 동 적용', sub: '주건축물 15개 동 중' });
    const some = buildBuildingView({ ...base, seismicApplied: 15, mainBuildingCount: 17 }, 'APARTMENT', NOW)!;
    expect(some.tiles.find((t) => t.label === '내진설계')).toEqual({ label: '내진설계', value: '15개 동 적용' });
  });
  it('세대와 호가 함께 있으면 둘을 합친 수로 나눈다(총 주차대수가 둘 다를 위한 값)', () => {
    const v = buildBuildingView({ ...base, groundFloors: 40, households: 500, units: 300, parkingTotal: 1200 }, 'OFFICETEL', NOW)!;
    expect(v.tiles.find((t) => t.label === '주차')).toEqual({ label: '주차', value: '세대·호당 1.50대', sub: '총 1,200대' });
    expect(v.tiles.find((t) => t.label === '규모')!.sub).toBe('500세대 · 300호');
    expect(v.formula).toBe('세대·호당 주차 = 총 주차대수 ÷ (세대수 + 호수)');
  });
});
