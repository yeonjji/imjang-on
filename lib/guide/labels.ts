import type { GuideCategory } from '@prisma/client';

const GUIDE_CATEGORY_LABEL: Record<GuideCategory, string> = {
  REALESTATE: '부동산',
  SUBSCRIPTION: '청약',
  FINANCE: '금융',
  MEDICAL: '의료',
  CHILDCARE: '보육',
  SCHOOL: '학교',
  LIFE: '생활',
};

export const GUIDE_CATEGORIES: { value: GuideCategory; label: string }[] = (
  ['REALESTATE', 'SUBSCRIPTION', 'FINANCE', 'MEDICAL', 'CHILDCARE', 'SCHOOL', 'LIFE'] as GuideCategory[]
).map((value) => ({ value, label: GUIDE_CATEGORY_LABEL[value] }));

export function guideCategoryLabel(c: GuideCategory): string {
  return GUIDE_CATEGORY_LABEL[c];
}
