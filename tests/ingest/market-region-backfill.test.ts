import { describe, it, expect } from 'vitest';
import { matchSigunguCode, type RegionRef } from '@/scripts/ingest/amenities/match-sigungu';

// 백필 스크립트 자체는 DB I/O라 통합 테스트가 어렵다.
// 핵심 매칭 로직(matchSigunguCode)이 시장 주소 샘플들로도 잘 동작하는지 회귀 가드.
describe('matchSigunguCode — 전통시장 주소 샘플', () => {
  const regions: RegionRef[] = [
    { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
    { sido: '경기도', sigungu: '성남시 분당구', sigunguCode: '41135' },
    { sido: '경기도', sigungu: '성남시 수정구', sigunguCode: '41131' },
    { sido: '부산광역시', sigungu: '해운대구', sigunguCode: '26350' },
  ];

  it('일반적인 도로명 주소를 시군구코드로 매핑', () => {
    expect(matchSigunguCode('서울특별시 강남구 테헤란로 100', regions)).toBe('11680');
    expect(matchSigunguCode('부산광역시 해운대구 우동 123', regions)).toBe('26350');
  });

  it('성남시 하위 구는 더 긴 접두를 우선 (분당구/수정구 구분)', () => {
    expect(matchSigunguCode('경기도 성남시 분당구 야탑동 99', regions)).toBe('41135');
    expect(matchSigunguCode('경기도 성남시 수정구 단대동 88', regions)).toBe('41131');
  });

  it('주소가 매칭 안 되면 null', () => {
    expect(matchSigunguCode('충청북도 청주시 상당구 1', regions)).toBeNull();
    expect(matchSigunguCode('', regions)).toBeNull();
  });
});
