/**
 * 가이드 본문에 넣을 수 있는 데이터 블록 키. 여기가 단일 진실 원천이다.
 *
 * 앞 4종은 **가벼운 블록** — 레지스트리를 렌더 시 직접 조회한다(`lib/guide/blocks/*.ts`).
 * 뒤 5종은 **무거운 블록** — 실거래 집계라 ETL이 만든 스냅샷을 읽는다(`lib/guide/blocks/heavy/*.ts`).
 */
export const GUIDE_DATA_BLOCK_KEYS = [
  'hospital-by-type',
  'childcare-by-type',
  'childcare-waitlist',
  'charger-mix',
  'area-price',
  'floor-premium',
  'price-trend-24m',
  'subway-premium',
  'ltv-by-region',
  'school-highschool-types',
  'hospital-by-dept',
  'public-health-centers',
  'special-supply-mix',
  'housing-loan-products',
  'infra-inventory',
] as const;

export type GuideDataBlockKey = (typeof GUIDE_DATA_BLOCK_KEYS)[number];

export function isGuideDataBlockKey(v: string): v is GuideDataBlockKey {
  return (GUIDE_DATA_BLOCK_KEYS as readonly string[]).includes(v);
}
