import { describe, it, expect } from 'vitest';
import { parseAddressRegion, regionMatches } from '@/lib/subscription/geo-validate';

describe('parseAddressRegion', () => {
  it('앞 두 토큰을 시도·시군구로 쪼갠다', () => {
    expect(parseAddressRegion('서울특별시 강동구 고덕로 399')).toEqual({ sido: '서울특별시', sigungu: '강동구' });
    expect(parseAddressRegion('경기도 양주시 옥정동 962-9')).toEqual({ sido: '경기도', sigungu: '양주시' });
  });
  it('토큰이 하나면 시군구는 null', () => {
    expect(parseAddressRegion('세종특별자치시')).toEqual({ sido: '세종특별자치시', sigungu: null });
  });
  it('앞뒤 공백과 중복 공백을 흡수한다', () => {
    expect(parseAddressRegion('  인천광역시   연수구 동춘동 ')).toEqual({ sido: '인천광역시', sigungu: '연수구' });
  });
});

describe('regionMatches', () => {
  it('시도·시군구가 모두 맞으면 통과', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });
  it('시도 표기가 달라도 접두사면 통과', () => {
    expect(regionMatches({ sido: '서울', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });
  it('시군구가 다르면 실패', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울특별시', region2: '강남구' })).toBe(false);
  });
  it('시도가 다르면 실패', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '양주시' }, { region1: '서울특별시', region2: '강동구' })).toBe(false);
  });
  it('주소에 시군구가 없으면 시도만 본다', () => {
    expect(regionMatches({ sido: '세종특별자치시', sigungu: null }, { region1: '세종특별자치시', region2: null })).toBe(true);
  });
  it('카카오가 지역을 안 주면 실패로 본다', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: null, region2: null })).toBe(false);
  });
  it('한 글자 접두사는 우연 일치라 인정하지 않는다', () => {
    expect(regionMatches({ sido: '서', sigungu: null }, { region1: '서울특별시', region2: null })).toBe(false);
  });
});
