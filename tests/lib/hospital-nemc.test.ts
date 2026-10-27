import { describe, it, expect } from 'vitest';
import { parseNemcPage, toHhmm } from '@/lib/hospital/nemc';
import { buildMatcher, normName, normRoad } from '@/lib/hospital/nemc-match';

const item = (o: Record<string, string>) => `<item>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`;
const page = (code: string, items: string, total = 1) =>
  `<?xml version="1.0"?><response><header><resultCode>${code}</resultCode></header><body><items>${items}</items><totalCount>${total}</totalCount></body></response>`;

describe('parseNemcPage', () => {
  it('요일·공휴일 시간과 안내를 읽는다', () => {
    const r = parseNemcPage(page('00', item({
      hpid: 'A2801836', dutyName: '자연미소치과의원', dutyAddr: '경상남도 창원시 마산합포구 북성로 92 (상남동)',
      dutyTel1: '055-245-3567', dutyTime1s: '1430', dutyTime1c: '2100', dutyTime6s: '1000', dutyTime6c: '1400',
      dutyTime8s: '0900', dutyTime8c: '1300', dutyEtc: '점심시간 13:00~14:30',
    })));
    expect(r.resultCode).toBe('00');
    expect(r.items[0]).toMatchObject({ hpid: 'A2801836', tel: '055-245-3567', note: '점심시간 13:00~14:30' });
    expect(r.items[0].hours).toMatchObject({ openMon: 1430, closeMon: 2100, openSat: 1000, closeSat: 1400, openHol: 900, closeHol: 1300, openSun: null });
  });
  it('item이 1개여도 배열, 0건이면 빈 배열', () => {
    expect(parseNemcPage(page('00', '', 0)).items).toEqual([]);
  });
  it('resultCode를 문자열 그대로 둔다(00이 0이 되지 않음)', () => {
    expect(parseNemcPage(page('00', '')).resultCode).toBe('00');
  });
  it('안내는 300자에서 자른다', () => {
    const r = parseNemcPage(page('00', item({ hpid: 'X', dutyName: 'a', dutyAddr: 'b', dutyEtc: '가'.repeat(400) })));
    expect(r.items[0].note).toHaveLength(300);
  });
});

describe('toHhmm', () => {
  it('HHMM 숫자 문자열만', () => {
    expect(toHhmm('0930')).toBe(930);
    expect(toHhmm('2500')).toBe(2500); // 저장은 하되 표시는 formatHospitalHours가 거른다
    expect(toHhmm('')).toBeNull();
    expect(toHhmm(undefined)).toBeNull();
    expect(toHhmm('9시')).toBeNull();
  });
});

describe('정규화', () => {
  it('이름은 공백·괄호 제거, 주소는 괄호·쉼표 뒤 제거', () => {
    expect(normName('(의)동남의료재단 동남병원')).toBe('동남의료재단동남병원');
    expect(normRoad('경상남도 창원시 마산합포구 북성로 92, (상남동)')).toBe('경상남도 창원시 마산합포구 북성로 92');
    expect(normRoad('경상남도 창원시 마산합포구 북성로 92 (상남동)')).toBe('경상남도 창원시 마산합포구 북성로 92');
  });
});

describe('buildMatcher', () => {
  const n = (name: string, addr: string, tel = '') =>
    ({ hpid: 'H', name, addr, tel, note: null, hours: {} as never });
  const ours = [
    { id: 1n, name: '자연미소치과의원', address: '경상남도 창원시 마산합포구 북성로 92, (상남동)', tel: '055-245-3567' },
    { id: 2n, name: '미소치과의원', address: '서울특별시 강남구 테헤란로 1', tel: '02-111-2222' },
    { id: 3n, name: '미소치과의원', address: '서울특별시 강남구 테헤란로 9', tel: '02-333-4444' },
    { id: 4n, name: '중복의원', address: '부산광역시 중구 중앙대로 1', tel: '051-1' },
    { id: 5n, name: '중복의원', address: '부산광역시 중구 중앙대로 1', tel: '051-2' },
  ];
  const match = buildMatcher(ours);
  it('이름+도로명 주소 1:1', () => {
    expect(match(n('자연미소치과의원', '경상남도 창원시 마산합포구 북성로 92 (상남동)'))).toBe(1n);
  });
  it('같은 이름 체인은 주소로 가른다', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 테헤란로 9'))).toBe(3n);
  });
  it('주소가 다르면 이름+전화로', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 다른로 5', '02-111-2222'))).toBe(2n);
  });
  it('주소도 전화도 안 맞으면 null', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 다른로 5', '02-999'))).toBeNull();
  });
  it('후보가 둘 이상이면 버린다', () => {
    expect(match(n('중복의원', '부산광역시 중구 중앙대로 1'))).toBeNull();
  });
});
