import { describe, it, expect } from 'vitest';
import {
  complexKey,
  propertyKey,
  dongOfAddress,
  dongMatches,
  diceSimilarity,
  decideMatch,
  phaseOf,
} from '@/scripts/ingest/apt-complex/match';

describe('정규화', () => {
  it('"아파트" 접미사를 제거한다', () => {
    expect(complexKey('월드메르디앙주상복합아파트', '잠실동')).toBe('월드메르디앙주상복합');
    expect(propertyKey('범어센트럴푸르지오아파트')).toBe('범어센트럴푸르지오');
  });
  it('앞에 붙은 동명을 제거한다', () => {
    expect(complexKey('잠실동트리지움', '잠실동')).toBe('트리지움');
  });
  it('동명 어간만 겹쳐도 제거한다', () => {
    expect(complexKey('잠실레이크팰리스', '잠실동')).toBe('레이크팰리스');
  });
  it('단지명이 동명으로만 이루어지면 그대로 둔다', () => {
    expect(complexKey('잠실동', '잠실동')).toBe('잠실동');
  });
  it('as3가 없으면 접두 제거를 건너뛴다', () => {
    expect(complexKey('트리지움', null)).toBe('트리지움');
  });
});

describe('dongOfAddress', () => {
  it('주소 선두의 동명을 뽑는다', () => {
    expect(dongOfAddress('범어동 2305')).toBe('범어동');
    expect(dongOfAddress('가락동 164-1')).toBe('가락동');
    expect(dongOfAddress('수성동1가 15')).toBe('수성동1가');
  });
  it('읍·면·리도 인식한다', () => {
    expect(dongOfAddress('고촌읍 신곡리 100')).toBe('고촌읍');
  });
  it('동명이 없으면 null', () => {
    expect(dongOfAddress('123-4')).toBeNull();
  });
});

describe('dongMatches', () => {
  it('같으면 통과', () => {
    expect(dongMatches('범어동', '범어동')).toBe(true);
  });
  it('표기 깊이만 다르면 통과', () => {
    expect(dongMatches('수성동1가', '수성동')).toBe(true);
    expect(dongMatches('수성동', '수성동1가')).toBe(true);
  });
  it('다른 동이면 차단', () => {
    expect(dongMatches('범어동', '파동')).toBe(false);
    expect(dongMatches('범어동', '중동')).toBe(false);
  });
  it('한쪽이 null이면 차단', () => {
    expect(dongMatches(null, '범어동')).toBe(false);
    expect(dongMatches('범어동', null)).toBe(false);
  });
});

describe('diceSimilarity', () => {
  it('같은 문자열은 1', () => {
    expect(diceSimilarity('범어아이파크', '범어아이파크')).toBe(1);
  });
  it('겹치는 게 없으면 0', () => {
    expect(diceSimilarity('가나다', '라마바')).toBe(0);
  });
  it('한 글자짜리는 0 (bigram 없음)', () => {
    expect(diceSimilarity('가', '가')).toBe(0);
  });
});

// 2026-09-07 audit 실측에서 나온 실제 사례를 그대로 고정한다.
describe('decideMatch — 실측 사례', () => {
  const P = (id: number, nameNorm: string, address: string) => ({
    id: BigInt(id),
    nameNorm,
    address,
  });

  it('Tier 1: 완전일치 + 유일', () => {
    expect(
      decideMatch({ kaptName: '범어에일린의뜰', as3: '범어동' }, [P(1, '범어에일린의뜰', '범어동 2272')]),
    ).toEqual({ propertyId: BigInt(1), tier: 1 });
  });

  it('Tier 1: 완전일치 후보가 복수면 버린다', () => {
    expect(
      decideMatch({ kaptName: '삼성래미안', as3: '범어동' }, [
        P(1, '삼성래미안', '범어동 100'),
        P(2, '삼성래미안', '범어동 200'),
      ]),
    ).toBeNull();
  });

  // 아래 둘은 설계 초안에서 Tier 2(유사도)로 예상했는데, 양쪽 키를 교차 비교하면
  // 완전일치로 붙는다. 유사도보다 안전한 경로라 Tier 1이 맞다.
  it('접미사 차이는 완전일치로 흡수된다', () => {
    expect(
      decideMatch({ kaptName: '범어센트럴푸르지오 아파트', as3: '범어동' }, [
        P(7, '범어센트럴푸르지오', '범어동 2257'),
      ]),
    ).toEqual({ propertyId: BigInt(7), tier: 1 });
  });

  it('접두 차이도 완전일치로 흡수된다 — 우리 이름에만 동명이 붙은 경우', () => {
    expect(
      decideMatch({ kaptName: '월드메르디앙이스턴카운티', as3: '범어동' }, [
        P(8, '범어월드메르디앙이스턴카운티', '범어동 500'),
      ]),
    ).toEqual({ propertyId: BigInt(8), tier: 1 });
  });

  // 실측: 역명 접두가 한쪽에만 붙어 완전일치가 안 되고 유사도로 붙는 경우.
  it('Tier 2: 완전일치가 안 되면 유사도로 붙는다', () => {
    expect(
      decideMatch({ kaptName: '금촌역더트루엘센트리지', as3: '금촌동' }, [
        P(15, '더트루엘센트리지', '금촌동 1313'),
      ]),
    ).toEqual({ propertyId: BigInt(15), tier: 2 });
  });

  it('동명이 다르면 유사도가 높아도 차단 — 프라지움 1차 vs 11차', () => {
    expect(
      decideMatch({ kaptName: '프라지움1차', as3: '두정동' }, [P(9, '프라지움11차아파트', '성정동 300')]),
    ).toBeNull();
  });

  it('동명이 다르면 차단 — 쌍용동일하이빌 vs 동일하이빌', () => {
    expect(
      decideMatch({ kaptName: '쌍용동일하이빌', as3: '쌍용동' }, [P(10, '동일하이빌', '불당동 12')]),
    ).toBeNull();
  });

  it('동명이 다르면 차단 — 범어아이파크 vs 수성아이파크', () => {
    expect(
      decideMatch({ kaptName: '범어아이파크', as3: '범어동' }, [P(11, '수성아이파크', '파동 1000')]),
    ).toBeNull();
  });

  it('임계값 미만이면 매칭하지 않는다', () => {
    expect(
      decideMatch({ kaptName: '가나다라마바', as3: '범어동' }, [P(12, '사아자차카타', '범어동 1')]),
    ).toBeNull();
  });

  it('최고점이 동점이면 버린다', () => {
    expect(
      decideMatch({ kaptName: '삼성래미안1차', as3: '범어동' }, [
        P(13, '삼성래미안2차', '범어동 1'),
        P(14, '삼성래미안3차', '범어동 2'),
      ]),
    ).toBeNull();
  });

  it('후보가 없으면 null', () => {
    expect(decideMatch({ kaptName: '범어에일린의뜰', as3: '범어동' }, [])).toBeNull();
  });
});

// 2026-09-08 전수 측정(단지 22,301 × Property 44,479)에서 나온 실제 사례.
describe('phaseOf — 차수 추출', () => {
  it('숫자·차·단지·동 표기를 뽑는다', () => {
    expect(phaseOf('이구로얄2차')).toBe('2');
    expect(phaseOf('경남아너스빌디센트1단지')).toBe('1');
    expect(phaseOf('한양에드가303동')).toBe('303');
    expect(phaseOf('동보렉스3')).toBe('3');
  });
  it('로마숫자를 아라비아로 정규화한다', () => {
    expect(phaseOf('호반써밋센트럴파크ⅰ')).toBe('1');
    expect(phaseOf('포항펜타시티대방엘리움퍼스티지ⅰ')).toBe('1');
  });
  it('차수가 없으면 null', () => {
    expect(phaseOf('동탄파라곤')).toBeNull();
    expect(phaseOf('e편한세상검단웰카운티')).toBeNull();
  });
});

describe('차수 게이트 — 전수 측정에서 잡힌 오매칭', () => {
  const P = (id: number, nameNorm: string, address: string) => ({
    id: BigInt(id),
    nameNorm,
    address,
  });

  it('한쪽에만 차수가 있으면 차단한다', () => {
    expect(
      decideMatch({ kaptName: '동탄파라곤2', as3: '반송동' }, [P(1, '동탄파라곤', '반송동 93-3')]),
    ).toBeNull();
    expect(
      decideMatch({ kaptName: '더샵신문그리니티1차', as3: '신문동' }, [
        P(2, '더샵신문그리니티', '신문동 100'),
      ]),
    ).toBeNull();
  });

  it('차수 표기만 다르고 숫자가 같으면 통과시킨다', () => {
    expect(
      decideMatch({ kaptName: '힐스테이트대구역퍼스트2단지', as3: '태평로3가' }, [
        P(3, '힐스테이트대구역퍼스트2차', '태평로3가 211-1'),
      ]),
    ).toMatchObject({ propertyId: BigInt(3) });
  });

  it('로마숫자와 아라비아숫자를 같은 차수로 본다', () => {
    expect(
      decideMatch({ kaptName: '호반 써밋 센트럴파크 1', as3: '용곡동' }, [
        P(4, '호반써밋센트럴파크ⅰ', '용곡동 462-77'),
      ]),
    ).toMatchObject({ propertyId: BigInt(4) });
  });

  it('브랜드 표기 차이는 흡수한다 — 이편한세상 ↔ e편한세상', () => {
    expect(
      decideMatch({ kaptName: '이편한 세상 검단 웰카운티', as3: '원당동' }, [
        P(5, 'e편한세상검단웰카운티', '원당동 1026-1'),
      ]),
    ).toMatchObject({ propertyId: BigInt(5) });
  });

  it('시·군 접두 차이도 흡수한다', () => {
    expect(
      decideMatch({ kaptName: '포항학산한신더휴엘리트파크', as3: '학산동' }, [
        P(6, '학산한신더휴엘리트파크', '학산동 359'),
      ]),
    ).toMatchObject({ propertyId: BigInt(6) });
  });
});
