import { describe, it, expect } from 'vitest';
import { parseAddressRegion, regionMatches, geocodeCandidates } from '@/lib/subscription/geo-validate';

describe('parseAddressRegion', () => {
  it('시도·시군구를 접미사로 찾는다', () => {
    expect(parseAddressRegion('서울특별시 강동구 고덕로 399')).toEqual({ sido: '서울특별시', sigungu: '강동구' });
    expect(parseAddressRegion('경기도 양주시 옥정동 962-9')).toEqual({ sido: '경기도', sigungu: '양주시' });
  });

  it('일반구를 시군구에 합친다 — 이게 1차 구현의 구멍이었다', () => {
    expect(parseAddressRegion('경기도 수원시 영통구 매탄동 100')).toEqual({ sido: '경기도', sigungu: '수원시 영통구' });
    expect(parseAddressRegion('경기도 성남시 분당구 판교로 1')).toEqual({ sido: '경기도', sigungu: '성남시 분당구' });
  });

  it('사업지구 같은 비행정 `구`를 건너뛰고 진짜 행정구를 찾는다', () => {
    expect(parseAddressRegion('경기도 수원시 광교지구 영통구 이의동 100')).toEqual({ sido: '경기도', sigungu: '수원시 영통구' });
  });

  it('시도가 문자열 앞에 없어도 찾는다', () => {
    expect(parseAddressRegion('파주메디컬클러스터 도시개발구역 A2BL (경기도 파주시 서패동 432번지 일원)'))
      .toEqual({ sido: '경기도', sigungu: '파주시' });
  });

  it('강화도 같은 장소명이 시도로 오인되지 않는다', () => {
    expect(parseAddressRegion('강화도 파크뷰 2단지(인천광역시 강화군 불은면 100)'))
      .toEqual({ sido: '인천광역시', sigungu: '강화군' });
  });

  it('시군구가 없으면 null', () => {
    expect(parseAddressRegion('세종특별자치시')).toEqual({ sido: '세종특별자치시', sigungu: null });
  });

  it('시도를 못 찾으면 빈 문자열', () => {
    expect(parseAddressRegion('알 수 없는 문자열')).toEqual({ sido: '', sigungu: null });
  });
});

describe('regionMatches', () => {
  it('시도·시군구가 맞으면 통과', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });

  it('카카오가 짧은 시도명을 줘도 통과 (실측: region1이 "서울")', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울', region2: '강동구' })).toBe(true);
  });

  it('카카오가 풀 시도명을 줘도 통과', () => {
    expect(regionMatches({ sido: '서울', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });

  it('일반구가 다르면 실패 — 접두사로 통과시키면 안 된다', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '수원시 영통구' }, { region1: '경기', region2: '수원시 팔달구' })).toBe(false);
  });

  it('일반구가 같으면 통과', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '수원시 영통구' }, { region1: '경기', region2: '수원시 영통구' })).toBe(true);
  });

  it('주소가 구를 안 밝히면 시 단위까지만 본다', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '수원시' }, { region1: '경기', region2: '수원시 팔달구' })).toBe(true);
  });

  it('시군구가 다르면 실패', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울', region2: '강남구' })).toBe(false);
  });

  it('시도가 다르면 실패', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '양주시' }, { region1: '서울', region2: '강동구' })).toBe(false);
  });

  it('주소에 시군구가 없으면 시도만 본다', () => {
    expect(regionMatches({ sido: '세종특별자치시', sigungu: null }, { region1: '세종특별자치시', region2: null })).toBe(true);
  });

  it('카카오가 지역을 안 주면 실패로 본다', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: null, region2: null })).toBe(false);
  });

  it('한 글자 접두사는 우연 일치라 인정하지 않는다', () => {
    expect(regionMatches({ sido: '서', sigungu: null }, { region1: '서울', region2: null })).toBe(false);
  });
});

describe('geocodeCandidates', () => {
  it('괄호 안의 지번을 끌어내 후보를 만든다 — 원문 그대로는 카카오가 못 찾는다', () => {
    const c = geocodeCandidates('군포대야미 공공주택지구 B1블럭(경기도 군포시 속달동 90-3번지 일원)');
    expect(c[0]).toBe('경기도 군포시 속달동 90-3');
    expect(c).toContain('경기도 군포시 속달동');
  });

  it('지번이 없으면 동까지만', () => {
    const c = geocodeCandidates('경기도 김포시 고촌읍 신곡리 김포신곡6지구 도시개발사업구역 A3BL');
    expect(c[0]).toBe('경기도 김포시 신곡리');
  });

  it('동도 없으면 시군구까지만', () => {
    expect(geocodeCandidates('경기도 군포시 군포대야미 공공주택지구 B1블럭')).toEqual(['경기도 군포시']);
  });

  it('후보는 최대 3개이고 중복이 없다', () => {
    const c = geocodeCandidates('경기도 양주시 옥정동 962-9, 962-8번지(옥정지구 중상1, 복합1블럭)');
    expect(c.length).toBeLessThanOrEqual(3);
    expect(new Set(c).size).toBe(c.length);
  });

  it('시도를 못 찾으면 빈 배열', () => {
    expect(geocodeCandidates('알 수 없는 문자열')).toEqual([]);
  });
});
