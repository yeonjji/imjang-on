import { describe, it, expect } from 'vitest';
import { marketDef } from '@/lib/amenity/adapters/market';
import type { AmenityItem } from '@/lib/amenity/category';

const base: AmenityItem = { id: 1n, name: '장호원전통시장', address: '경기도 이천시', sigunguCode: '41500' };

describe('marketDef.detailFields', () => {
  it('값이 하나도 없으면 행을 만들지 않는다 ("-" 금지)', () => {
    expect(marketDef.detailFields(base)).toEqual([]);
  });

  it('채워진 값만 순서대로 행으로', () => {
    const rows = marketDef.detailFields({
      ...base,
      marketType: '상설장+4일장',
      openCycle: '4일+9일',
      establishedYear: 1955,
      tel: '031-643-1330',
      homepage: 'http://www.jmarket.org/',
    });
    expect(rows.map((r) => r.label)).toEqual(['시장 유형', '분류', '개설 주기', '개설 연도', '전화', '홈페이지']);
    expect(rows.find((r) => r.label === '개설 연도')!.value).toBe('1955년');
    expect(rows.find((r) => r.label === '홈페이지')!.href).toBe('http://www.jmarket.org/');
  });

  it('스킴 없는 홈페이지는 https를 붙여 링크한다', () => {
    const rows = marketDef.detailFields({ ...base, homepage: 'www.sagimakgol.com' });
    expect(rows[0]).toEqual({ label: '홈페이지', value: 'www.sagimakgol.com', href: 'https://www.sagimakgol.com' });
  });

  it('링크가 아닌 홈페이지 값은 텍스트로만', () => {
    const rows = marketDef.detailFields({ ...base, homepage: '없음' });
    expect(rows[0]).toEqual({ label: '홈페이지', value: '없음' });
  });
});
