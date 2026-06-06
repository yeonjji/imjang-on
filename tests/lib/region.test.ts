import { describe, it, expect } from 'vitest';
import { sidoPrefix, sidoFromPrefix, shortSidoFromRegionCode, getPopularSigungus } from '@/lib/region';

describe('sidoPrefix', () => {
  it('짧은 시도명', () => {
    expect(sidoPrefix('서울')).toBe('11');
    expect(sidoPrefix('경기')).toBe('41');
    expect(sidoPrefix('제주')).toBe('50');
  });

  it('풀 시도명 (행정 접미사 포함)', () => {
    expect(sidoPrefix('서울특별시')).toBe('11');
    expect(sidoPrefix('경기도')).toBe('41');
    expect(sidoPrefix('세종특별자치시')).toBe('36');
    expect(sidoPrefix('제주특별자치도')).toBe('50');
    expect(sidoPrefix('부산광역시')).toBe('26');
  });

  it('미존재 시도명', () => {
    expect(sidoPrefix('존재하지않음')).toBeUndefined();
    expect(sidoPrefix('')).toBeUndefined();
  });
});

describe('sidoFromPrefix', () => {
  it('정상 prefix', () => {
    expect(sidoFromPrefix('11')).toBe('서울');
    expect(sidoFromPrefix('41')).toBe('경기');
    expect(sidoFromPrefix('50')).toBe('제주');
  });

  it('미존재 prefix', () => {
    expect(sidoFromPrefix('99')).toBeUndefined();
    expect(sidoFromPrefix('')).toBeUndefined();
  });
});

describe('shortSidoFromRegionCode', () => {
  it('서울 코드(11..)를 서울로 매핑', () => {
    expect(shortSidoFromRegionCode('1168010100')).toBe('서울');
  });
  it('경기 코드(41..)를 경기로 매핑', () => {
    expect(shortSidoFromRegionCode('4113510300')).toBe('경기');
  });
  it('null/undefined는 null', () => {
    expect(shortSidoFromRegionCode(null)).toBeNull();
    expect(shortSidoFromRegionCode(undefined)).toBeNull();
  });
  it('매칭 안 되는 prefix는 null', () => {
    expect(shortSidoFromRegionCode('9900000000')).toBeNull();
  });
  it('빈 문자열은 null', () => {
    expect(shortSidoFromRegionCode('')).toBeNull();
  });
});

describe('getPopularSigungus', () => {
  it('limit 이하의 배열을 반환한다', async () => {
    const result = await getPopularSigungus(6);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('각 항목은 sigunguCode/sido/sigungu 문자열을 가진다', async () => {
    const result = await getPopularSigungus(6);
    for (const r of result) {
      expect(typeof r.sigunguCode).toBe('string');
      expect(typeof r.sido).toBe('string');
      expect(typeof r.sigungu).toBe('string');
      expect(r.sigunguCode.length).toBe(5);
    }
  });

  it('sido는 sigunguCode 앞 2자리의 시도 단축명과 일치한다', async () => {
    const result = await getPopularSigungus(6);
    for (const r of result) {
      expect(r.sido).toBe(sidoFromPrefix(r.sigunguCode.slice(0, 2)));
    }
  });

  it('sigunguCode는 중복되지 않는다', async () => {
    const result = await getPopularSigungus(6);
    const codes = result.map((r) => r.sigunguCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
