import { describe, it, expect } from 'vitest';
import { getRangeMonths } from '@/scripts/ingest/transactions/months';

describe('getRangeMonths', () => {
  it('to부터 from까지 최신→과거 내림차순으로 YYYYMM 목록 생성', () => {
    expect(getRangeMonths('202403', '202406')).toEqual(['202406', '202405', '202404', '202403']);
  });

  it('연도 경계를 넘어 내려간다', () => {
    expect(getRangeMonths('202211', '202301')).toEqual(['202301', '202212', '202211']);
  });

  it('from === to면 단일 월', () => {
    expect(getRangeMonths('202505', '202505')).toEqual(['202505']);
  });

  it('전체 백필 구간은 29개월', () => {
    const months = getRangeMonths('202301', '202505');
    expect(months.length).toBe(29);
    expect(months[0]).toBe('202505');
    expect(months[months.length - 1]).toBe('202301');
  });
});
