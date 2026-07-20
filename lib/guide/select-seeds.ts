import { GUIDE_SEEDS, type GuideSeed } from '@/lib/guide/seeds';

/**
 * --only 값(CSV·단일 key·미지정) → 생성 대상 시드.
 * falsy면 전체(주의: 전체 실행은 기존 시드까지 LLM 재호출 = 재과금).
 * CSV면 해당 key만 반환(재과금 방어). 매칭 없으면 빈 배열.
 */
export function selectGuideSeeds(
  onlyValue: string | null | undefined,
  seeds: GuideSeed[] = GUIDE_SEEDS,
): GuideSeed[] {
  if (!onlyValue) return seeds;
  const keys = onlyValue.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return []; // 트루시 값이 유효 key 0개 → 빈 배열(스크립트가 loud fail). 재과금 방어.
  return seeds.filter((s) => keys.includes(s.key));
}
