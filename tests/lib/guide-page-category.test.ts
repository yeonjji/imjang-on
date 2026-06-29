import { describe, it, expect } from 'vitest';
import { guideCategoryForPage } from '@/lib/guide/page-category';
import { GuideCategory } from '@prisma/client';

describe('guideCategoryForPage', () => {
  it('POI/매물 라우트를 가이드 카테고리로 매핑한다', () => {
    expect(guideCategoryForPage('medical/hospital')).toBe(GuideCategory.MEDICAL);
    expect(guideCategoryForPage('medical/pharmacy')).toBe(GuideCategory.MEDICAL);
    expect(guideCategoryForPage('childcare')).toBe(GuideCategory.CHILDCARE);
    expect(guideCategoryForPage('apt')).toBe(GuideCategory.REALESTATE);
    expect(guideCategoryForPage('jeonse-guarantee')).toBe(GuideCategory.FINANCE);
    expect(guideCategoryForPage('subway')).toBe(GuideCategory.LIFE);
  });
  it('매칭 없으면 null(관련 가이드 블록 생략용)', () => {
    expect(guideCategoryForPage('unknown')).toBeNull();
  });
});
