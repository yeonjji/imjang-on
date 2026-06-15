import { describe, it, expect } from 'vitest';
import { categoryLabel, typeLabel, BOARD_CATEGORIES } from '@/lib/board/labels';

describe('categoryLabel', () => {
  it('카테고리를 한글 라벨로 변환한다', () => {
    expect(categoryLabel('FINANCE')).toBe('금융');
    expect(categoryLabel('LOAN')).toBe('대출');
    expect(categoryLabel('ECONOMY')).toBe('경제');
    expect(categoryLabel('SUBSCRIPTION')).toBe('청약');
    expect(categoryLabel('REALESTATE')).toBe('부동산');
  });
});
describe('typeLabel', () => {
  it('유형을 한글 라벨로 변환한다', () => {
    expect(typeLabel('PROGRAM')).toBe('제도·상품');
    expect(typeLabel('TREND')).toBe('이슈·동향');
  });
});
describe('BOARD_CATEGORIES', () => {
  it('5개 카테고리를 노출 순서대로 가진다', () => {
    expect(BOARD_CATEGORIES.map((c) => c.value)).toEqual(['FINANCE','LOAN','ECONOMY','SUBSCRIPTION','REALESTATE']);
    for (const c of BOARD_CATEGORIES) expect(c.label.length).toBeGreaterThan(0);
  });
});
