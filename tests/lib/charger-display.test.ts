import { describe, it, expect } from 'vitest';
import { facilityKindLabel, floorLabel, maxOutputKw, installYearRange } from '@/lib/urban/charger-display';

describe('facilityKindLabel', () => {
  it('대분류 코드만 라벨로', () => {
    expect(facilityKindLabel('H0')).toBe('공동주택시설');
    expect(facilityKindLabel('A0')).toBe('공공시설');
    expect(facilityKindLabel('J0')).toBe('교육문화시설');
  });
  it('원천 오타 BO(영문 O)는 B0(주차시설)로 읽는다 — 상세 코드가 B001(공영주차장)', () => {
    expect(facilityKindLabel('BO')).toBe('주차시설');
  });
  it('표에 없는 코드·빈 값은 null(추측 금지)', () => {
    expect(facilityKindLabel('Z9')).toBeNull();
    expect(facilityKindLabel('H001')).toBeNull();
    expect(facilityKindLabel(null)).toBeNull();
  });
});

describe('floorLabel', () => {
  it('지하·지상 층', () => {
    expect(floorLabel('B', 2)).toBe('지하 2층');
    expect(floorLabel('F', 1)).toBe('지상 1층');
  });
  it('형식·범위 밖은 null', () => {
    expect(floorLabel('X', 1)).toBeNull();
    expect(floorLabel('B', 0)).toBeNull();
    expect(floorLabel('F', null)).toBeNull();
  });
});

describe('maxOutputKw / installYearRange', () => {
  it('충전기별 값 요약', () => {
    const units = [{ outputKw: 7, installYear: 2022 }, { outputKw: 50, installYear: 2017 }, { outputKw: null, installYear: null }];
    expect(maxOutputKw(units)).toBe(50);
    expect(installYearRange(units)).toBe('2017~2022년');
  });
  it('한 해면 단일 연도, 값이 없으면 null', () => {
    expect(installYearRange([{ installYear: 2018 }, { installYear: 2018 }])).toBe('2018년');
    expect(maxOutputKw([{ outputKw: null }])).toBeNull();
    expect(installYearRange([])).toBeNull();
  });
});
