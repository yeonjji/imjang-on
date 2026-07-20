import { GuideCategory } from '@prisma/client';

/** POI/매물 상세 라우트 키 → 가이드 카테고리. 매칭 없으면 null(관련 가이드 블록 생략). */
const PAGE_TO_GUIDE: Record<string, GuideCategory> = {
  'medical/hospital': GuideCategory.MEDICAL,
  'medical/pharmacy': GuideCategory.MEDICAL,
  childcare: GuideCategory.CHILDCARE,
  school: GuideCategory.SCHOOL,
  apt: GuideCategory.REALESTATE,
  villa: GuideCategory.REALESTATE,
  officetel: GuideCategory.REALESTATE,
  region: GuideCategory.REALESTATE,
  subscription: GuideCategory.SUBSCRIPTION,
  finance: GuideCategory.FINANCE,
  'jeonse-guarantee': GuideCategory.FINANCE,
  amenity: GuideCategory.LIFE,
  urban: GuideCategory.LIFE,
  subway: GuideCategory.LIFE,
  life: GuideCategory.LIFE,
};

export function guideCategoryForPage(pageKey: string): GuideCategory | null {
  return PAGE_TO_GUIDE[pageKey] ?? null;
}
