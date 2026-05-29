import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseParkingXml } from '@/scripts/ingest/amenities/adapter-parking';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/parking-sample.xml'),
  'utf-8',
);

describe('adapter-parking', () => {
  it('totalCount와 row 개수를 정확히 파싱한다', () => {
    const { rows, totalCount } = parseParkingXml(xml);
    expect(totalCount).toBe(3);
    expect(rows).toHaveLength(3);
  });

  it('정상 row 필드를 모두 정규화한다 (PK-A001)', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A001')!;
    expect(r).toBeDefined();
    expect(r.name).toBe('산동우항공원 공영주차장');
    expect(r.prkplceSe).toBe('공영');
    expect(r.prkplceType).toBe('노외');
    expect(r.address).toBe('경상북도 구미시 신당4로1길 56');
    expect(r.rdnmadr).toBe('경상북도 구미시 신당4로1길 56');
    expect(r.lnmadr).toBe('경상북도 구미시 산동읍 신당리 2017');
    expect(r.lat).toBeCloseTo(36.1538745);
    expect(r.lng).toBeCloseTo(128.4316946);
    expect(r.prkcmprt).toBe(233);
    expect(r.feedingSe).toBe('2');
    expect(r.enforceSe).toBe('5부제');
    expect(r.operDay).toBe('평일+토요일+공휴일');
    expect(r.weekdayOpenHhmm).toBe('00:00');
    expect(r.weekdayCloseHhmm).toBe('23:59');
    expect(r.satOpenHhmm).toBe('00:00');
    expect(r.satCloseHhmm).toBe('23:59');
    expect(r.holidayOpenHhmm).toBe('00:00');
    expect(r.holidayCloseHhmm).toBe('23:59');
    expect(r.chargeInfo).toBe('유료');
    expect(r.basicTime).toBe(30);
    expect(r.basicCharge).toBe(300);
    expect(r.addUnitTime).toBe(10);
    expect(r.addUnitCharge).toBe(100);
    expect(r.dayCmmtkt).toBe(3000);
    expect(r.monthCmmtkt).toBe(0);
    expect(r.metpay).toBe('신용카드');
    expect(r.spcmnt).toBe('요금면제 대상 다수');
    expect(r.pwdbsPpkZoneYn).toBe(true);
    expect(r.institutionNm).toBe('구미도시공사 주차시설팀');
    expect(r.phoneNumber).toBe('054-480-2030');
    expect(r.insttCode).toBe('B555076');
    expect(r.insttNm).toBe('구미도시공사');
    expect(r.referenceDate).toEqual(new Date(Date.UTC(2026, 3, 17)));
  });

  it('pwdbsPpkZoneYn N → false', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A002')!;
    expect(r.pwdbsPpkZoneYn).toBe(false);
    expect(r.chargeInfo).toBe('무료');
  });

  it('좌표 0/누락 → null, 도로명 빈 값이면 지번주소로 fallback, 빈 숫자/날짜는 null', () => {
    const { rows } = parseParkingXml(xml);
    const r = rows.find((x) => x.sourceId === 'PK-A003')!;
    expect(r).toBeDefined();
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
    expect(r.address).toBe('부산광역시 사하구 다대동 113-7');
    expect(r.rdnmadr).toBeNull();
    expect(r.lnmadr).toBe('부산광역시 사하구 다대동 113-7');
    expect(r.prkcmprt).toBeNull();
    expect(r.referenceDate).toBeNull();
    expect(r.pwdbsPpkZoneYn).toBeNull();
  });
});
