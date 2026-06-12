import { describe, it, expect } from 'vitest';
import { propertyMetaDescription } from '@/lib/seo/blurb';

const base = {
  name: '래미안대치팰리스',
  typeLabel: '아파트',
  regionFullName: '서울 강남구 대치동',
  builtYear: 2015,
  households: 1608,
  saleAvgPrice12m: 352000,
  jeonseAvgDeposit12m: 180000,
  txCount12m: 42,
};

describe('propertyMetaDescription', () => {
  it('데이터 풍부: 가격·전세가율·준공·세대수를 포함한다', () => {
    const d = propertyMetaDescription(base);
    expect(d).toContain('매매 35.2억');
    expect(d).toContain('전세 18억');
    expect(d).toContain('전세가율 51%');
    expect(d).toContain('2015년 준공');
    expect(d).toContain('1,608세대');
    expect(d).toContain('서울 강남구 대치동');
    expect(d.endsWith('공공데이터로 확인하세요.')).toBe(true);
  });

  it('가격 없음: 데이터부족 폴백 문장을 반환한다', () => {
    const d = propertyMetaDescription({ ...base, saleAvgPrice12m: null, jeonseAvgDeposit12m: null });
    expect(d).toContain('신고 거래는 아직 적습니다');
    expect(d).not.toContain('전세가율');
    expect(d).not.toContain('-');
  });

  it('전세만 없음: 전세가율을 생략한다', () => {
    const d = propertyMetaDescription({ ...base, jeonseAvgDeposit12m: null });
    expect(d).toContain('매매 35.2억');
    expect(d).not.toContain('전세 ');
    expect(d).not.toContain('전세가율');
  });

  it('준공·세대수 없음: 앞 콤마 없이 깔끔하게 조립한다', () => {
    const d = propertyMetaDescription({ ...base, builtYear: null, households: null });
    expect(d).not.toContain('. , ');
    expect(d).toContain('서울 강남구 대치동 실거래가를');
  });
});
