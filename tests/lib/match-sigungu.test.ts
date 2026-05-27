import { describe, it, expect } from 'vitest';
import { matchSigunguCode, type RegionRef } from '@/scripts/ingest/amenities/match-sigungu';

const regions: RegionRef[] = [
  { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
  { sido: '경기도', sigungu: '성남시 분당구', sigunguCode: '41135' },
  { sido: '경기도', sigungu: '성남시 수정구', sigunguCode: '41131' },
  { sido: '부산광역시', sigungu: '해운대구', sigunguCode: '26350' },
  { sido: '강원특별자치도', sigungu: '춘천시', sigunguCode: '51110' },
];

describe('matchSigunguCode', () => {
  it('단일 구 주소를 매칭한다', () => {
    expect(matchSigunguCode('서울특별시 강남구 개포로109길 21', regions)).toBe('11680');
  });
  it('시+구 2토큰 시군구를 가장 긴 접두로 매칭한다', () => {
    expect(matchSigunguCode('경기도 성남시 분당구 불정로 6', regions)).toBe('41135');
  });
  it('광역시 자치구를 매칭한다', () => {
    expect(matchSigunguCode('부산광역시 해운대구 우동 1', regions)).toBe('26350');
  });
  it('특별자치도 시를 매칭한다', () => {
    expect(matchSigunguCode('강원특별자치도 춘천시 시청길 11', regions)).toBe('51110');
  });
  it('연속 공백·앞뒤 공백을 정규화한다', () => {
    expect(matchSigunguCode('  서울특별시   강남구  테헤란로 1 ', regions)).toBe('11680');
  });
  it('목록에 없으면 null', () => {
    expect(matchSigunguCode('제주특별자치도 서귀포시 1', regions)).toBeNull();
  });
  it('빈 문자열이면 null', () => {
    expect(matchSigunguCode('', regions)).toBeNull();
  });
});
