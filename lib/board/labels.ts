import type { PostCategory, PostType } from '@prisma/client';

const CATEGORY_LABEL: Record<PostCategory, string> = {
  FINANCE: '금융', LOAN: '대출', ECONOMY: '경제', SUBSCRIPTION: '청약', REALESTATE: '부동산',
};
const TYPE_LABEL: Record<PostType, string> = { PROGRAM: '제도·상품', TREND: '이슈·동향' };

export function categoryLabel(category: PostCategory): string { return CATEGORY_LABEL[category]; }
export function typeLabel(type: PostType): string { return TYPE_LABEL[type]; }

/** 목록 필터 탭 노출 순서(고정). */
export const BOARD_CATEGORIES: { value: PostCategory; label: string }[] = (
  ['FINANCE','LOAN','ECONOMY','SUBSCRIPTION','REALESTATE'] as PostCategory[]
).map((value) => ({ value, label: CATEGORY_LABEL[value] }));
