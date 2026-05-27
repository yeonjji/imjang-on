export type AmenityCategory = 'school' | 'medical' | 'mart' | 'park' | 'charger';

// Store.industryCode 접두 → 카테고리. (adapter-store.ts STORE_UPJONG_TARGETS 기준)
const STORE_PREFIX: Array<{ prefix: string; category: AmenityCategory }> = [
  { prefix: 'G20405', category: 'mart' },    // 편의점
  { prefix: 'G20404', category: 'mart' },    // 슈퍼마켓
  { prefix: 'G20402', category: 'mart' },    // 대형마트
  { prefix: 'I21201', category: 'mart' },    // 카페
  { prefix: 'G21501', category: 'medical' }, // 약국
  { prefix: 'Q101', category: 'medical' },   // 병원
  { prefix: 'Q102', category: 'medical' },   // 의원
];

export function storeIndustryToCategory(code: string | null): AmenityCategory | null {
  if (!code) return null;
  for (const { prefix, category } of STORE_PREFIX) {
    if (code.startsWith(prefix)) return category;
  }
  return null;
}
