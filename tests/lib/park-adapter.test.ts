import { describe, it, expect } from 'vitest';
import { parkDef } from '@/lib/urban/adapters/park';
import type { ParkRaw } from '@/lib/urban/adapters/park';

function makeItem(raw: Partial<ParkRaw>) {
  return { id: 1n, name: '테스트공원', address: '서울', sigunguCode: null, raw: raw as ParkRaw };
}

describe('parkDef.inferRowSummary', () => {
  it('area가 있으면 "N ㎡" 형식으로 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: 415466 }))).toBe('415,466 ㎡');
  });
  it('area가 null이면 null 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: null }))).toBeNull();
  });
  it('area가 0이면 null 반환', () => {
    expect(parkDef.inferRowSummary(makeItem({ area: 0 }))).toBeNull();
  });
});

describe('parkDef.detailFields', () => {
  it('parkType·area 모두 있으면 두 항목 반환', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: '근린공원', area: 100000 }),
      { regionFullName: '서울 동작구' },
    );
    expect(fields).toEqual([
      { label: '공원 유형', value: '근린공원' },
      { label: '면적', value: '100,000 ㎡' },
    ]);
  });
  it('parkType·area 모두 null이면 빈 배열', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: null, area: null }),
      { regionFullName: '' },
    );
    expect(fields).toEqual([]);
  });
  it('parkType만 있으면 한 항목 반환', () => {
    const fields = parkDef.detailFields(
      makeItem({ parkType: '어린이공원', area: null }),
      { regionFullName: '' },
    );
    expect(fields).toEqual([{ label: '공원 유형', value: '어린이공원' }]);
  });
});
