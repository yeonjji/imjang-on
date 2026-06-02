import { describe, it, expect } from 'vitest';
import { parsePharmacyRows } from '@/scripts/ingest/amenities/adapter-pharmacy';

const PHARMACY_ROWS: Record<string, unknown>[] = [
  {
    '암호화요양기호': 'PH001',
    '요양기관명': '행복약국',
    '종별코드': 81,
    '종별코드명': '약국',
    '시도코드': 110000,
    '시도코드명': '서울',
    '시군구코드': 110001,
    '시군구코드명': '서울종로구',
    '읍면동': '종로동',
    '우편번호': '03181',
    '주소': '서울특별시 종로구 종로 10',
    '전화번호': '02-111-2222',
    '개설일자': new Date('2015-06-01'),
    '좌표(X)': 126.979,
    '좌표(Y)': 37.573,
  },
  {
    '암호화요양기호': 'PH002',
    '요양기관명': '건강약국',
    '종별코드': 81,
    '종별코드명': '약국',
    '시도코드': 340000,
    '시도코드명': '충남',
    '시군구코드': 340600,
    '시군구코드명': '서산시',
    '읍면동': '지곡면',
    '우편번호': '31919',
    '주소': '충청남도 서산시 지곡면 충의로 1',
    '전화번호': null,
    '개설일자': null,
    '좌표(X)': 0,
    '좌표(Y)': 0,
  },
];

describe('parsePharmacyRows', () => {
  it('기본 필드를 파싱한다', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows).toHaveLength(2);
    const r = rows[0];
    expect(r.sourceId).toBe('PH001');
    expect(r.name).toBe('행복약국');
    expect(r.typeCode).toBe('81');
    expect(r.typeName).toBe('약국');
    expect(r.sido).toBe('서울');
    expect(r.sigunguCode).toBe('110001');
    expect(r.address).toBe('서울특별시 종로구 종로 10');
    expect(r.tel).toBe('02-111-2222');
    expect(r.openedAt).toEqual(new Date('2015-06-01'));
    expect(r.lat).toBeCloseTo(37.573);
    expect(r.lng).toBeCloseTo(126.979);
  });

  it('좌표 0은 null 처리한다', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows[1].lat).toBeNull();
    expect(rows[1].lng).toBeNull();
  });

  it('전화번호/개설일자 null 처리', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows[1].tel).toBeNull();
    expect(rows[1].openedAt).toBeNull();
  });

  it('sourceId 없는 행 스킵', () => {
    const rows = parsePharmacyRows([{ ...PHARMACY_ROWS[0], '암호화요양기호': '' }]);
    expect(rows).toHaveLength(0);
  });
});
