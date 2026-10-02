import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvChargerXml } from '@/scripts/ingest/amenities/adapter-ev-charger';

const xml = readFileSync(resolve('tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml'), 'utf-8');
const { stations, units } = parseEvChargerXml(xml);
const st = (id: string) => stations.find((s) => s.sourceId === id)!;
const un = (id: string) => units.find((u) => u.stationSourceId === id)!;

describe('adapter-ev-charger 상세 필드', () => {
  it('아파트 충전소: 이용 제한·이용 시간·지하 2층·시설 구분·상세 위치', () => {
    const s = st('PI707748');
    expect(s.accessLimited).toBe(true);
    expect(s.limitDetail).toBe('거주자외 출입제한');
    expect(s.useTime).toBe('08:00~20:00');
    expect(s.parkingFree).toBe(true);
    expect(s.floorType).toBe('B');
    expect(s.floorNum).toBe(2);
    expect(s.facilityKind).toBe('H0');
    expect(s.facilityKindDetail).toBe('H001');
    expect(s.operatorTel).toBe('1600-4047');
    expect(s.locationDetail).toBe('B2(102동 3대, 104동 2대) 총 5대');
  });

  it('공공 충전소: 제한 없음, 유료 주차, 빈 상세 위치는 null', () => {
    const s = st('ME174027');
    expect(s.accessLimited).toBe(false);
    expect(s.limitDetail).toBeNull();
    expect(s.parkingFree).toBe(false);
    expect(s.locationDetail).toBeNull();
  });

  it('충전기 단위: 출력·설치 연도', () => {
    expect(un('PI707748')).toMatchObject({ outputKw: 7, installYear: 2022 });
    expect(un('ME174027')).toMatchObject({ outputKw: 50, installYear: 2017 });
  });

  it('경계: 빈 값·범위 밖·형식 위반은 null, 숫자로 바뀐 전화번호는 버린다', () => {
    const s = st('XX000001');
    expect(s.accessLimited).toBeNull();
    expect(s.useTime).toBeNull();
    expect(s.parkingFree).toBeNull();
    expect(s.floorType).toBeNull();
    expect(s.floorNum).toBeNull();
    expect(s.facilityKind).toBeNull();
    expect(s.operatorTel).toBeNull();
    expect(un('XX000001')).toMatchObject({ outputKw: null, installYear: null });
  });

  it('E0·E001 같은 시설 코드를 지수 표기 숫자(NaN)로 바꾸지 않는다', () => {
    const s = st('ME000E01');
    expect(s.facilityKind).toBe('E0');
    expect(s.facilityKindDetail).toBe('E001');
  });

  it('충전기마다 제한 여부가 섞이면, 하나라도 제한이면 제한(행 순서와 무관)과 첫 제한 사유', () => {
    const s = st('PI000MIX');
    expect(s.accessLimited).toBe(true);
    expect(s.limitDetail).toBe('거주자외 출입제한');
  });
});
