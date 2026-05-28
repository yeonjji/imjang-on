import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseChildcareXml,
  detectChildcareError,
} from '@/scripts/ingest/amenities/adapter-childcare';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/childcare-sample.xml'),
  'utf-8',
);

describe('adapter-childcare', () => {
  it('정상·폐지 2건을 모두 파싱한다 (상태 보존)', () => {
    const rows = parseChildcareXml(xml, '11710');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status)).toEqual(['정상', '폐지']);
  });

  it('sigunguCode는 호출 arcode로 채운다 (응답에 없음)', () => {
    const rows = parseChildcareXml(xml, '11710');
    expect(rows.every((r) => r.sigunguCode === '11710')).toBe(true);
  });

  it('핵심 필드와 카운트를 매핑한다', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    expect(a.name).toBe('1111어린이집');
    expect(a.crType).toBe('가정');
    expect(a.capacity).toBe(18);
    expect(a.currentCount).toBe(17);
    expect(a.cctvCount).toBe(7);
    expect(a.classCntTot).toBe(7);
    expect(a.emRoleDirector).toBe(1);
    expect(a.emRoleTeacher).toBe(4);
    expect(a.waitCnt01).toBe(4);
    expect(a.waitCntTot).toBe(18);
  });

  it('한국 영역 좌표만 사용하고 범위 밖은 null 처리한다', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    const b = rows.find((r) => r.sourceId === '11200000040')!;
    expect(a.lat).toBeCloseTo(37.50452212);
    expect(a.lng).toBeCloseTo(127.1043009);
    expect(b.lat).toBeNull();
    expect(b.lng).toBeNull();
  });

  it('빈 날짜/빈 홈페이지는 null', () => {
    const rows = parseChildcareXml(xml, '11710');
    const a = rows.find((r) => r.sourceId === '11620000341')!;
    expect(a.pauseBeginDate).toBeNull();
    expect(a.abolishDate).toBeNull();
    expect(a.confirmDate?.toISOString().slice(0, 10)).toBe('2007-01-10');
    const b = rows.find((r) => r.sourceId === '11200000040')!;
    expect(b.homepage).toBeNull();
    expect(b.abolishDate?.toISOString().slice(0, 10)).toBe('2015-05-04');
  });

  it('정보/에러 코드를 분류한다', () => {
    expect(detectChildcareError('<response>INFO-100</response>')).toBe('key');
    expect(detectChildcareError('<response>INFO-300</response>')).toBe('rate');
    expect(detectChildcareError('<response>ERROR-200</response>')).toBe('server');
    expect(detectChildcareError('<response>INFO-200</response>')).toBeNull();
    expect(parseChildcareXml('<response>INFO-200</response>', '11710')).toEqual([]);
  });
});
