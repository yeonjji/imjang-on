/** 가이드 본문에 넣을 수 있는 데이터 블록 키. 여기가 단일 진실 원천이다. */
export const GUIDE_DATA_BLOCK_KEYS = [
  'hospital-by-type',
  'childcare-by-type',
  'childcare-waitlist',
  'charger-mix',
] as const;

export type GuideDataBlockKey = (typeof GUIDE_DATA_BLOCK_KEYS)[number];

export function isGuideDataBlockKey(v: string): v is GuideDataBlockKey {
  return (GUIDE_DATA_BLOCK_KEYS as readonly string[]).includes(v);
}
