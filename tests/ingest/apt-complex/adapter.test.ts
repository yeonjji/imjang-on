import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseAptList, parseAptDetail, areaSumMatches } from '@/scripts/ingest/apt-complex/adapter';

// 픽스처는 2026-09-07 실호출 응답 그대로다(손으로 쓰지 않았다).
// 손으로 썼다면 items가 배열이 아니라 {item:[...]}인 줄 알고 어댑터를 잘못 짰을 것이다.
const load = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf-8'));
const list = load('apt-list.json');
const basis = load('apt-basis.json');
const dtl = load('apt-dtl.json');

describe('parseAptList', () => {
  it('items가 직접 배열인 실제 응답을 파싱한다', () => {
    const { rows, totalCount } = parseAptList(list);
    expect(totalCount).toBe(22301);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      kaptCode: 'A10021295',
      kaptName: '경희궁의아침4단지',
      nameNorm: '경희궁의아침4단지',
      bjdCode: '1111011800',
      sigunguCode: '11110',
      as3: '내수동',
    });
  });

  it('sigunguCode는 bjdCode 앞 5자리다', () => {
    expect(parseAptList(list).rows.every((r) => r.sigunguCode === '11110')).toBe(true);
  });

  it('items가 {item:[...]}로 감싸여 와도 파싱한다', () => {
    const wrapped = {
      response: {
        body: {
          items: { item: [{ kaptCode: 'A1', kaptName: '가나', bjdCode: '1171010100', as3: '잠실동' }] },
          totalCount: 1,
        },
      },
    };
    expect(parseAptList(wrapped).rows).toHaveLength(1);
  });

  it('item이 객체 하나로 와도 배열로 만든다', () => {
    const one = {
      response: {
        body: {
          items: { item: { kaptCode: 'A1', kaptName: '가나', bjdCode: '1171010100', as3: '잠실동' } },
          totalCount: 1,
        },
      },
    };
    expect(parseAptList(one).rows).toHaveLength(1);
  });

  it('items가 비었으면 빈 배열', () => {
    expect(parseAptList({ response: { body: { items: '', totalCount: 0 } } })).toEqual({
      rows: [],
      totalCount: 0,
    });
  });

  it('필수 키가 없는 행은 버린다', () => {
    const bad = { response: { body: { items: [{ kaptName: '이름만' }], totalCount: 1 } } };
    expect(parseAptList(bad).rows).toHaveLength(0);
  });
});

describe('parseAptDetail', () => {
  const row = parseAptDetail('A10025850', basis, dtl);

  it('실수로 오는 숫자를 Int로 바꾼다 (kaptdaCnt=9510.0)', () => {
    expect(row.households).toBe(9510);
    expect(row.area60).toBe(2854);
    expect(row.area85).toBe(5132);
    expect(row.area135).toBe(1500);
    expect(row.area136).toBe(24);
  });

  it('문자열로 오는 숫자도 Int로 바꾼다 (kaptDongCnt="84")', () => {
    expect(row.buildingCount).toBe(84);
    expect(row.parkingUnder).toBe(12096);
    expect(row.cctv).toBe(2685);
  });

  it('승강기는 kaptdEcnt다 — 기본정보의 kaptdEcntp(183)가 아니다', () => {
    expect(row.elevator).toBe(384);
  });

  it('EV는 groundElChargerCnt/undergroundElChargerCnt다', () => {
    expect(row.evGround).toBe(0);
    expect(row.evUnder).toBe(256);
  });

  it('지상주차 0을 null이 아니라 0으로 둔다 — 전면 지하주차라는 정보다', () => {
    expect(row.parkingGround).toBe(0);
  });

  it('kaptUsedate(YYYYMMDD)를 Date로 바꾼다', () => {
    expect(row.usedate?.toISOString().slice(0, 10)).toBe('2018-12-28');
  });

  it('분류·교통 문자열을 담는다', () => {
    expect(row.hallType).toBe('혼합식');
    expect(row.heatType).toBe('지역난방');
    expect(row.aptKind).toBe('아파트');
    expect(row.topFloor).toBe(35);
    expect(row.baseFloor).toBe(3);
    expect(row.subwayLine).toBe('3호선, 8호선, 9호선');
    expect(row.subwayStation).toBe('송파역');
    expect(row.walkSubway).toBe('5분이내');
    expect(row.walkBus).toBe('5분이내');
    expect(row.builder).toBe('현대건설,삼성물산,현대산업개발');
  });

  // 실측 A10023296(송파파인타운12단지): subwayLine이 "1호선, 1호선, … 부산-김해경전철"
  // 200자로 오는데 subwayStation은 ", , , , "다. 컬럼 길이(60)를 넘겨 적재가 통째로 실패했다.
  it('지하철 노선의 중복을 제거한다', () => {
    const empty = { response: { body: { item: {} } } };
    const dup = {
      response: {
        body: { item: { subwayLine: '1호선, 1호선, 2호선, 2호선, 3호선', subwayStation: '서울역, 서울역' } },
      },
    };
    const r = parseAptDetail('A1', empty, dup);
    expect(r.subwayLine).toBe('1호선, 2호선, 3호선');
    expect(r.subwayStation).toBe('서울역');
  });

  it('역명이 쉼표뿐이면 노선까지 결측으로 본다', () => {
    const empty = { response: { body: { item: {} } } };
    const junk = {
      response: {
        body: {
          item: {
            subwayLine: '1호선, 1호선, 2호선, 부산-김해경전철, 동해선',
            subwayStation: ', , , , ',
          },
        },
      },
    };
    const r = parseAptDetail('A1', empty, junk);
    expect(r.subwayStation).toBeNull();
    expect(r.subwayLine).toBeNull();
  });

  // 실측 A41072713(산들마을1단지): 역명은 '일산역'으로 정상인데 노선에 전국 목록이 온다.
  it('역명이 정상이어도 노선이 5개를 넘으면 노선만 버린다', () => {
    const empty = { response: { body: { item: {} } } };
    const junk = {
      response: {
        body: {
          item: {
            subwayLine: '1호선, 2호선, 3호선, 4호선, 부산-김해경전철, 동해선, 5호선, 6호선',
            subwayStation: '일산역, 일산역, 일산역',
          },
        },
      },
    };
    const r = parseAptDetail('A1', empty, junk);
    expect(r.subwayStation).toBe('일산역'); // 역명은 살린다
    expect(r.subwayLine).toBeNull();
  });

  it('환승역 5개까지는 통과시킨다 (김포공항역 기준)', () => {
    const empty = { response: { body: { item: {} } } };
    const ok = {
      response: {
        body: {
          item: {
            subwayLine: '5호선, 9호선, 공항철도, 김포골드라인, 대곡소사선',
            subwayStation: '김포공항역',
          },
        },
      },
    };
    expect(parseAptDetail('A1', empty, ok).subwayLine).toBe(
      '5호선, 9호선, 공항철도, 김포골드라인, 대곡소사선',
    );
  });

  it('정상 노선은 그대로 둔다', () => {
    expect(parseAptDetail('A10025850', basis, dtl).subwayLine).toBe('3호선, 8호선, 9호선');
  });

  it('useYn=Y면 inUse=true', () => {
    expect(row.inUse).toBe(true);
  });

  it('rawJson에 두 응답을 병합해 원본을 보존한다(3군·연락처 포함)', () => {
    expect(row.rawJson.kaptTel).toBe('024038330');
    expect(row.rawJson.codeMgr).toBe('위탁관리');
    expect(row.rawJson.codeStr).toBe('철근콘크리트구조');
  });

  it('빈 문자열·공백·누락은 null로 만든다', () => {
    const blank = { response: { body: { item: { kaptCode: 'A1', codeHallNm: '', kaptUrl: ' ' } } } };
    const empty = { response: { body: { item: {} } } };
    const r = parseAptDetail('A1', blank, empty);
    expect(r.hallType).toBeNull();
    expect(r.households).toBeNull();
    expect(r.subwayLine).toBeNull();
  });

  // 실측 A10019936(디마크당산): kaptdaCnt=0, kaptTarea=0, ktownFlrNo=0에
  // 나머지가 빈 문자열인 사실상 빈 레코드. 0을 그대로 두면 "0세대 단지"가 된다.
  it('세대수·동수·최고층·승강기·CCTV의 0은 결측으로 본다', () => {
    const zeros = {
      response: {
        body: {
          item: { kaptCode: 'A1', kaptdaCnt: 0, kaptDongCnt: 0, kaptTopFloor: 0, kaptBaseFloor: 0 },
        },
      },
    };
    const zerosDtl = { response: { body: { item: { kaptdEcnt: 0, kaptdCccnt: 0 } } } };
    const r = parseAptDetail('A1', zeros, zerosDtl);
    expect(r.households).toBeNull();
    expect(r.buildingCount).toBeNull();
    expect(r.topFloor).toBeNull();
    expect(r.baseFloor).toBeNull();
    expect(r.elevator).toBeNull();
    expect(r.cctv).toBeNull();
  });

  it('주차·EV·면적대의 0은 실제 값으로 살린다', () => {
    const empty = { response: { body: { item: {} } } };
    const z = {
      response: {
        body: { item: { kaptdPcnt: 0, kaptdPcntu: 0, groundElChargerCnt: 0, undergroundElChargerCnt: 0 } },
      },
    };
    const r = parseAptDetail('A1', empty, z);
    expect(r.parkingGround).toBe(0);
    expect(r.parkingUnder).toBe(0);
    expect(r.evGround).toBe(0);
    expect(r.evUnder).toBe(0);
  });

  it('useYn이 N이면 inUse=false', () => {
    const off = { response: { body: { item: { kaptCode: 'A1', useYn: 'N' } } } };
    const empty = { response: { body: { item: {} } } };
    expect(parseAptDetail('A1', empty, off).inUse).toBe(false);
  });
});

describe('areaSumMatches', () => {
  it('실제 헬리오시티는 합이 일치한다 (2854+5132+1500+24=9510)', () => {
    expect(areaSumMatches(parseAptDetail('A10025850', basis, dtl))).toBe(true);
  });

  it('한 칸이라도 null이면 false', () => {
    expect(
      areaSumMatches({ area60: 2854, area85: 5132, area135: null, area136: 24, households: 9510 }),
    ).toBe(false);
  });

  it('합이 1이라도 어긋나면 false — 허용오차 없음', () => {
    expect(
      areaSumMatches({ area60: 2854, area85: 5132, area135: 1500, area136: 24, households: 9511 }),
    ).toBe(false);
  });

  it('households가 null이면 false', () => {
    expect(areaSumMatches({ area60: 1, area85: 1, area135: 1, area136: 1, households: null })).toBe(
      false,
    );
  });
});
