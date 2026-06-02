import { describe, it, expect } from 'vitest';
import { formatOpenedDate, buildPharmacyInfoRows } from '@/lib/pharmacy/utils';

describe('formatOpenedDate', () => {
  it('Date를 YYYY.MM.DD로 변환', () => {
    expect(formatOpenedDate(new Date(Date.UTC(2010, 4, 3)))).toBe('2010.05.03');
    expect(formatOpenedDate(new Date(Date.UTC(1999, 11, 25)))).toBe('1999.12.25');
  });
  it('null이면 null', () => {
    expect(formatOpenedDate(null)).toBeNull();
  });
});

describe('buildPharmacyInfoRows', () => {
  it('값이 있는 필드만 라벨/값 순서대로 반환', () => {
    const rows = buildPharmacyInfoRows({
      typeName: '약국',
      openedAt: new Date(Date.UTC(2010, 4, 3)),
      tel: '02-123-4567',
      zipcode: null,
      sido: '서울특별시',
      sigungu: '강남구',
      eupmyeondong: null,
    });
    expect(rows).toEqual([
      { label: '종별', value: '약국' },
      { label: '개설일', value: '2010.05.03' },
      { label: '전화', value: '02-123-4567' },
      { label: '시도', value: '서울특별시' },
      { label: '시군구', value: '강남구' },
    ]);
  });
  it('모든 필드가 있으면 7개 행을 정의된 순서로 반환', () => {
    const rows = buildPharmacyInfoRows({
      typeName: '약국', openedAt: new Date(Date.UTC(2010, 4, 3)),
      tel: '02-0000-0000', zipcode: '06234',
      sido: '서울특별시', sigungu: '강남구', eupmyeondong: '역삼동',
    });
    expect(rows.map(r => r.label)).toEqual(['종별','개설일','전화','우편번호','시도','시군구','읍면동']);
    expect(rows[3]).toEqual({ label: '우편번호', value: '06234' });
  });
  it('모든 필드가 비면 빈 배열', () => {
    expect(buildPharmacyInfoRows({
      typeName: null, openedAt: null, tel: null, zipcode: null,
      sido: null, sigungu: null, eupmyeondong: null,
    })).toEqual([]);
  });
});
