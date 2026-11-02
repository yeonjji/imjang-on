import { describe, it, expect } from 'vitest';
import { buildPharmacyFaq } from '@/lib/faq/builders/pharmacy';
import { buildParkFaq, buildParkingFaq, buildChargerFaq, type ParkingFaqInput } from '@/lib/faq/builders/urban';
import { composeDetailFaq } from '@/lib/faq/compose';

const noJunk = (items: { q: string; a: string }[]) => {
  for (const it of items) {
    expect(it.q.endsWith('?'), it.q).toBe(true);
    expect(it.a, it.q).not.toMatch(/undefined|NaN|null/);
  }
};

describe('buildPharmacyFaq', () => {
  it('전화·개설·일요일 진료를 화면 값으로 만든다', () => {
    const items = buildPharmacyFaq({
      name: '온누리약국', tel: '02-123-4567', years: 11, openedYear: 2016,
      dong: { dong: '역삼동', count: 12, openedRank: 3 }, sundayClinics: 2,
    });
    expect(items).toHaveLength(3);
    noJunk(items);
    expect(items[0].a).toContain('02-123-4567');
    expect(items[0].a).toContain('운영시간을 아직 제공하지 않아');
    expect(items[1].q).toBe('온누리약국은 언제 문을 열었나요?');
    expect(items[1].a).toBe('2016년에 개설해 올해 11년차입니다. 역삼동 약국 12곳 중 3번째로 문을 열었습니다.');
    expect(items[2].a).toContain('반경 500m 안에 일요일 진료시간을 공개한 병·의원이 2곳');
  });

  it('값이 없으면 문항을 만들지 않고, 2개 미만이면 블록 생략', () => {
    const items = buildPharmacyFaq({ name: '약국', tel: '010', years: null, openedYear: null, dong: null, sundayClinics: 0 });
    expect(items).toHaveLength(1);
    expect(composeDetailFaq(items)).toBeNull();
  });
});

describe('buildParkFaq', () => {
  const base = {
    name: '양재시민의숲', parkType: '근린공원', area: 258_991, managingOrg: '서초구청', tel: '02-2155-6870',
    facilityPlay: '그네+미끄럼틀', facilitySport: '배드민턴장+족구장+농구장+테니스장+게이트볼장+풋살장',
    facilityConvenience: null, facilityCulture: null,
    areaRank: { rank: 1, total: 34, scope: '서초구 근린공원' },
  };

  it('유형·면적·순위, 시설, 관리기관', () => {
    const items = buildParkFaq(base);
    noJunk(items);
    expect(items[0].q).toBe('양재시민의숲은 어떤 공원인가요?');
    expect(items[0].a).toBe(
      '양재시민의숲은 근린공원으로 면적은 258,991 ㎡입니다. 축구장 약 36개 크기입니다. 서초구 근린공원 34곳 중 면적 1위입니다.',
    );
    expect(items[1].a).toContain('놀이시설은 그네, 미끄럼틀입니다.');
    expect(items[1].a).toContain('운동시설은 배드민턴장, 족구장, 농구장, 테니스장, 게이트볼장 등 6종입니다.');
    expect(items[2].a).toBe('서초구청이 관리합니다. 문의 전화는 02-2155-6870입니다.');
  });

  it('빈 공원은 문항 없음', () => {
    const items = buildParkFaq({
      ...base, parkType: null, area: null, managingOrg: null, tel: null,
      facilityPlay: null, facilitySport: null, areaRank: null,
    });
    expect(items).toEqual([]);
  });
});

describe('buildParkingFaq', () => {
  const base: ParkingFaqInput = {
    name: '역삼공영주차장', prkplceSe: '공영', prkplceType: '노외', prkcmprt: 120,
    chargeInfo: '유료', basicTime: 30, basicCharge: 1500, addUnitTime: 10, addUnitCharge: 500,
    dayCmmtkt: null, monthCmmtkt: 150_000,
    weekdayOpenHhmm: '09:00', weekdayCloseHhmm: '21:00', satOpenHhmm: null, satCloseHhmm: null,
    holidayOpenHhmm: null, holidayCloseHhmm: null,
  };

  it('요금·운영시간·면수', () => {
    const items = buildParkingFaq(base);
    noJunk(items);
    expect(items[0].a).toContain('기본요금 30분 1,500원, 추가단위 10분 500원, 월정기 150,000원입니다.');
    expect(items[1].a).toContain('평일 09:00 ~ 21:00입니다. 빠진 요일은');
    expect(items[2].a).toBe('주차구획은 120면입니다. 공영 노외주차장으로 등록돼 있습니다.');
  });

  it('무료·24시간', () => {
    const items = buildParkingFaq({
      ...base, chargeInfo: '무료',
      weekdayOpenHhmm: '00:00', weekdayCloseHhmm: '23:59', satOpenHhmm: '0000', satCloseHhmm: '2400',
      holidayOpenHhmm: '00:00', holidayCloseHhmm: '23:59',
    });
    expect(items[0].a).toContain('무료 주차장으로 등록돼');
    expect(items[1].a).toContain('모두 24시간 운영');
  });
});

describe('buildChargerFaq', () => {
  const base = {
    name: '래미안아파트', useTime: '24시간 이용가능', parkingFree: true, accessLimited: false,
    limitDetail: null, operatorTel: '1661-9408',
    units: [
      { isFast: true, outputKw: 100 },
      { isFast: false, outputKw: 7 },
      { isFast: false, outputKw: 7 },
    ],
  };

  it('급속·완속 대수, 이용시간·주차료, 개방', () => {
    const items = buildChargerFaq(base);
    noJunk(items);
    expect(items[0].a).toBe('급속 1기, 완속 2기가 있습니다. 최대 출력은 100kW입니다.');
    expect(items[1].a).toBe('등록된 이용 시간은 24시간 이용가능입니다. 주차료는 무료로 등록돼 있습니다.');
    expect(items[2].a).toBe('등록 정보상 이용 제한이 없는 충전소입니다. 운영사 연락처는 1661-9408입니다.');
  });

  it('완속만·이용 제한(사유 없음)', () => {
    const items = buildChargerFaq({
      ...base, accessLimited: true, operatorTel: null,
      units: [{ isFast: false, outputKw: null }],
    });
    expect(items[0].a).toBe('급속 충전기는 없고 완속 1기가 있습니다.');
    expect(items[2].a).toBe('이용 제한이 있는 충전소입니다. 운영기관에 이용 가능 여부를 확인하세요.');
  });
});

describe('괄호로 끝나는 이름의 조사(괄호 앞 말 기준)', () => {
  const base = {
    useTime: null, parkingFree: null, accessLimited: false, limitDetail: null, operatorTel: null, units: [],
  };
  it('받침 있는 말 + 괄호 → 은', () => {
    expect(buildChargerFaq({ ...base, name: '죽전역해링턴플레이스더원(대구)' })[0].q).toBe('죽전역해링턴플레이스더원(대구)은 누구나 이용할 수 있나요?');
  });
  it('받침 없는 말 + 괄호 → 는', () => {
    expect(buildChargerFaq({ ...base, name: '사남중심지활성화센터(사천)' })[0].q).toBe('사남중심지활성화센터(사천)는 누구나 이용할 수 있나요?');
  });
});
