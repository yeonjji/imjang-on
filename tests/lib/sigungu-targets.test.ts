import { describe, it, expect } from 'vitest';
import { selectSigunguTargets, type RegionRow } from '@/scripts/ingest/transactions/sigungu';

describe('selectSigunguTargets', () => {
  it('일반구 통합시: 시 코드 제외하고 구 코드 사용', () => {
    const regions: RegionRow[] = [
      { code: '4113000000', level: 2 }, // 성남시 (제외돼야)
      { code: '4113100000', level: 3 }, // 수정구
      { code: '4113300000', level: 3 }, // 중원구
      { code: '4113500000', level: 3 }, // 분당구
    ];
    const m = selectSigunguTargets(regions);
    expect(m.has('41130')).toBe(false);
    expect(m.get('41131')).toBe('4113100000');
    expect(m.get('41133')).toBe('4113300000');
    expect(m.get('41135')).toBe('4113500000');
    expect(m.size).toBe(3);
  });

  it('일반 시군구(level-2)는 그대로 포함', () => {
    const m = selectSigunguTargets([{ code: '1111000000', level: 2 }]); // 서울 종로구
    expect(m.get('11110')).toBe('1111000000');
  });

  it('읍면동(level-3, 코드 끝 00000 아님)은 일반구로 오인하지 않음', () => {
    const regions: RegionRow[] = [
      { code: '1111000000', level: 2 }, // 종로구
      { code: '1111051500', level: 3 }, // 청운효자동 (읍면동)
    ];
    const m = selectSigunguTargets(regions);
    expect(m.size).toBe(1);
    expect(m.has('11110')).toBe(true);
  });

  it('세종: 동이 level-2라 prefix로 collapse되어 1건', () => {
    const regions: RegionRow[] = [
      { code: '3611010100', level: 2 }, // 세종시 반곡동
      { code: '3611010200', level: 2 }, // 세종시 소담동
      { code: '3611025000', level: 2 }, // 세종시 조치원읍
    ];
    const m = selectSigunguTargets(regions);
    expect(m.size).toBe(1);
    expect(m.has('36110')).toBe(true);
  });
});
