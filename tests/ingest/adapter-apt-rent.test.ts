import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterAptRent } from '@/scripts/ingest/transactions/adapter-apt-rent';

const xml = readFileSync(resolve('tests/ingest/fixtures/apt-rent-sample.xml'), 'utf-8');

describe('adapter-apt-rent', () => {
  it('전세 행을 파싱한다 (monthlyRent 0 → JEONSE)', () => {
    const { rows, totalCount } = adapterAptRent.parseRows(xml, '28275');
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      propertyType: 'APARTMENT',
      dealType: 'JEONSE',
      name: '루원더퍼스트',
      buildYear: 2019,
      deposit: 20_000,
      monthlyRent: 0,
      exclusiveArea: 59.96,
      floor: 9,
      sigunguCode: '28275',
      umd: '가정동',
      jibun: '597-1',
    });
  });

  it('monthlyRent가 있으면 WOLSE로 분류한다', () => {
    const { rows } = adapterAptRent.parseRows(xml, '28275');
    expect(rows[1]).toMatchObject({ dealType: 'WOLSE', deposit: 15_000, monthlyRent: 60 });
  });

  // 이 API의 도로명 필드는 roadNm이 아니라 전부 소문자 roadnm이다.
  // 대문자 N으로 읽던 탓에 아파트 전월세 379만 행의 도로명주소가 전부 null로 수집됐다.
  it('roadnm(소문자)을 도로명주소로 수집한다 — 건물번호 포함', () => {
    const { rows } = adapterAptRent.parseRows(xml, '28275');
    expect(rows[0].roadName).toBe('봉오재2로 13');
    expect(rows[1].roadName).toBe('봉오대로 270');
  });

  // 지번이 미부여(`가-`)여도 도로명주소는 정상이므로 함께 보존한다.
  it('비정형 지번이어도 도로명주소는 채운다', () => {
    const { rows } = adapterAptRent.parseRows(xml, '28275');
    expect(rows[1].jibun).toBe('가-');
    expect(rows[1].roadName).toBe('봉오대로 270');
  });
});
