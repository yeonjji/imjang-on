import { describe, it, expect } from 'vitest';
import { propertyAddress, metaRegionName } from '@/lib/property';

const songpa = { fullName: '서울특별시 송파구' };
const gyeongju = { fullName: '경상북도 경주시' };
const seocho = { fullName: '서울특별시 서초구' };
const incheonSeo = { fullName: '인천광역시 서구' };
const gangnam = { fullName: '서울특별시 강남구' };
// 세종은 구가 없어 동 단위 Region 행이 시군구 레벨로 오분류돼 있다(기존 시드 결함).
const sejongYongho = { fullName: '세종특별자치시 용호동' };

describe('propertyAddress', () => {
  it('법정동 + 지번이면 정확한 지번주소를 만든다', () => {
    expect(propertyAddress({ address: '가락동 913' }, songpa)).toEqual({
      locality: '가락동',
      jibun: '913',
      street: '가락동 913',
      display: '서울특별시 송파구 가락동 913',
      localityDisplay: '서울특별시 송파구 가락동',
    });
  });

  it('법정동이 두 단어여도 뒤에서 한 토큰만 지번으로 본다', () => {
    expect(propertyAddress({ address: '외동읍 모화리 1853' }, gyeongju)).toEqual({
      locality: '외동읍 모화리',
      jibun: '1853',
      street: '외동읍 모화리 1853',
      display: '경상북도 경주시 외동읍 모화리 1853',
      localityDisplay: '경상북도 경주시 외동읍 모화리',
    });
  });

  it('산번지를 지번으로 인정한다', () => {
    const r = propertyAddress({ address: '내곡동 산123' }, seocho);
    expect(r.jibun).toBe('산123');
    expect(r.street).toBe('내곡동 산123');
  });

  it('부번을 지번으로 인정한다', () => {
    const r = propertyAddress({ address: '잠실동 19-1' }, songpa);
    expect(r.jibun).toBe('19-1');
    expect(r.street).toBe('잠실동 19-1');
  });

  it('비정형 지번(가-)은 지번으로 인정하지 않고 법정동까지만 남긴다', () => {
    expect(propertyAddress({ address: '가정동 가-' }, incheonSeo)).toEqual({
      locality: '가정동',
      jibun: null,
      street: null,
      display: '인천광역시 서구 가정동',
      localityDisplay: '인천광역시 서구 가정동',
    });
  });

  it('숫자로 시작해도 토큰 전체가 지번이 아니면 인정하지 않는다', () => {
    const r = propertyAddress({ address: '가정동 1234블록' }, incheonSeo);
    expect(r.jibun).toBeNull();
    expect(r.street).toBeNull();
    expect(r.locality).toBe('가정동');
  });

  it('지번이 결측이면 법정동만 남긴다', () => {
    expect(propertyAddress({ address: '역삼동' }, gangnam)).toEqual({
      locality: '역삼동',
      jibun: null,
      street: null,
      display: '서울특별시 강남구 역삼동',
      localityDisplay: '서울특별시 강남구 역삼동',
    });
  });

  it('법정동 없는 단일 숫자 토큰은 주소로 인정하지 않는다', () => {
    expect(propertyAddress({ address: '913' }, songpa)).toEqual({
      locality: null,
      jibun: null,
      street: null,
      display: '서울특별시 송파구',
      localityDisplay: '서울특별시 송파구',
    });
  });

  it('빈 문자열이면 시군구까지만 표시한다', () => {
    expect(propertyAddress({ address: '' }, songpa)).toEqual({
      locality: null,
      jibun: null,
      street: null,
      display: '서울특별시 송파구',
      localityDisplay: '서울특별시 송파구',
    });
  });

  it('Region이 다른 법정동으로 끝나면 그 꼬리를 떼어 법정동 중복을 막는다', () => {
    expect(propertyAddress({ address: '산울동 가-' }, sejongYongho)).toEqual({
      locality: '산울동',
      jibun: null,
      street: null,
      display: '세종특별자치시 산울동',
      localityDisplay: '세종특별자치시 산울동',
    });
  });
});

describe('metaRegionName', () => {
  const addr = propertyAddress({ address: '가락동 913' }, songpa);

  it('확정이면 지번주소를 쓴다', () => {
    expect(metaRegionName(addr, songpa, true)).toBe('서울특별시 송파구 가락동 913');
  });

  it('미확정이면 시군구로 낮춘다', () => {
    expect(metaRegionName(addr, songpa, false)).toBe('서울특별시 송파구');
  });

  it('street이 있어도 미확정이면 시군구로 낮춘다', () => {
    expect(addr.street).not.toBeNull();
    expect(metaRegionName(addr, songpa, false)).not.toContain('913');
  });
});
