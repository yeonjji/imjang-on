import { describe, it, expect } from 'vitest';
import { parseAddressRegion, regionMatches, geocodeCandidates } from '@/lib/subscription/geo-validate';
import { SIDO_NAMES, canonicalSido } from '@/lib/region';

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

  it('구 시도 명칭도 인식한다 — 공고가 여러 해에 걸쳐 있다', () => {
    expect(parseAddressRegion('강원도 원주시 무실동 100')).toEqual({ sido: '강원도', sigungu: '원주시' });
    expect(parseAddressRegion('전라북도 전주시 완산구 효자동 100')).toEqual({ sido: '전라북도', sigungu: '전주시 완산구' });
    expect(parseAddressRegion('제주도 서귀포시 중문동 100')).toEqual({ sido: '제주도', sigungu: '서귀포시' });
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

  it('축약형·풀네임 시도 조합도 통과 — 카카오는 축약형을 주고 공고는 풀네임을 쓸 수 있다', () => {
    // Finding E: 충청·전라·경상 도의 축약형(충북·전북·경북·경남)은 prefix-startsWith 안 됨
    expect(regionMatches({ sido: '충청북도', sigungu: '옥천군' }, { region1: '충북', region2: '옥천군' })).toBe(true);
    expect(regionMatches({ sido: '충청남도', sigungu: '아산시' }, { region1: '충남', region2: '아산시' })).toBe(true);
    expect(regionMatches({ sido: '전라북도', sigungu: '전주시' }, { region1: '전북', region2: '전주시' })).toBe(true);
    expect(regionMatches({ sido: '전라남도', sigungu: '순천시' }, { region1: '전남', region2: '순천시' })).toBe(true);
    expect(regionMatches({ sido: '경상북도', sigungu: '포항시' }, { region1: '경북', region2: '포항시' })).toBe(true);
    expect(regionMatches({ sido: '경상남도', sigungu: '창원시' }, { region1: '경남', region2: '창원시' })).toBe(true);
  });

  it('인천 구 재편(2026-07-01): 옛 구명 주소 + 신 구명 좌표 통과', () => {
    // Finding F: 인천의 중구·서구·동구는 신 구들로 나뉨. 공고는 옛 이름, 카카오는 신 이름.
    expect(regionMatches({ sido: '인천광역시', sigungu: '중구' }, { region1: '인천', region2: '영종구' })).toBe(true);
    expect(regionMatches({ sido: '인천광역시', sigungu: '중구' }, { region1: '인천', region2: '제물포구' })).toBe(true);
    expect(regionMatches({ sido: '인천광역시', sigungu: '서구' }, { region1: '인천', region2: '검단구' })).toBe(true);
    expect(regionMatches({ sido: '인천광역시', sigungu: '서구' }, { region1: '인천', region2: '서해구' })).toBe(true);
  });

  it('인천 재편은 인천에만 적용 — 다른 도시는 여전히 거부', () => {
    // 서울 중구 + 영종구는 거부 (영종구는 인천에만 있음)
    expect(regionMatches({ sido: '서울특별시', sigungu: '중구' }, { region1: '서울', region2: '영종구' })).toBe(false);
    // 인천 중구 + 연수구는 거부 (연수구는 옛 서구, 중구 아님)
    expect(regionMatches({ sido: '인천광역시', sigungu: '중구' }, { region1: '인천', region2: '연수구' })).toBe(false);
  });

  it('인천 동구도 재편 예외 적용 — 동구 + 제물포구 통과', () => {
    // Finding H: 동구도 재편 예외에 포함
    expect(regionMatches({ sido: '인천광역시', sigungu: '동구' }, { region1: '인천', region2: '제물포구' })).toBe(true);
    // 하지만 다른 신 구(검단구는 서구 그룹)는 거부
    expect(regionMatches({ sido: '인천광역시', sigungu: '동구' }, { region1: '인천', region2: '검단구' })).toBe(false);
  });

  it('전남광주 통합(2026-07-01): 축약형 표기도 정규화된다', () => {
    // Finding G: 전남광주 축약형도 정규화되어야 함
    expect(regionMatches({ sido: '전남광주', sigungu: '남구' }, { region1: '전남광주', region2: '남구' })).toBe(true);
    expect(regionMatches({ sido: '전남광주', sigungu: '남구' }, { region1: '전남광주통합특별시', region2: '남구' })).toBe(true);
    expect(regionMatches({ sido: '전남광주통합특별시', sigungu: '남구' }, { region1: '전남광주', region2: '남구' })).toBe(true);
  });

  it('SIDO_NAMES의 모든 표기가 정규화된다 — regionMatches가 이 불변식에 기댄다', () => {
    for (const n of SIDO_NAMES) {
      expect(canonicalSido(n), `canonicalSido should normalize "${n}"`).not.toBeNull();
    }
  });

  // SIDO_ALIASES는 '광주'·'광주광역시'·'전남'·'전라남도'를 두 canonical 항목(전남광주통합특별시,
  // 광주광역시/전라남도) 아래에 중복으로 갖고 있어, canonicalSido()의 결과가 객체 리터럴 선언
  // 순서에 의존한다. 지금은 '전남광주통합특별시'가 먼저 선언돼 맞지만, 순서가 바뀌면 조용히
  // 달라진다 — 여기서 못박아 둔다.
  it("'광주'·'전남'은 전남광주통합특별시로 정규화된다 — 선언 순서 의존을 못박는다", () => {
    expect(canonicalSido('광주')).toBe('전남광주통합특별시');
    expect(canonicalSido('전남')).toBe('전남광주통합특별시');
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
