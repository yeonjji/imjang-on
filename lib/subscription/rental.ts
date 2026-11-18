import type { SubscriptionCategory } from '@prisma/client';

/**
 * 임대 공고 판정. 청약홈은 모든 유형의 금액을 '공급금액(최고가 기준)'으로 표기하는데,
 * 임대 공고의 이 금액이 보증금인지 분양전환가인지는 원문에도 없다. 그래서 임대 공고는
 * '분양가'라 부르지 않고 원문 표기 '공급금액'을 쓴다.
 * 실측(2026-11-18): APT RENT_SECD_NM 임대 196공고, 공공지원민간임대 193, 오피스텔등 민간임대 81.
 * 무순위·임의공급은 rawJson에 임대 구분 필드가 없어 판정하지 않는다.
 */
export function isRentalNotice(category: SubscriptionCategory | string, rawJson: unknown): boolean {
  if (category === 'PUB_PRIV_RENT') return true;
  const r = rawJson && typeof rawJson === 'object' ? (rawJson as Record<string, unknown>) : {};
  if (category === 'APT') return String(r.RENT_SECD_NM ?? '').includes('임대');
  if (category === 'OFFICETEL_ETC') return r.HOUSE_DTL_SECD_NM === '민간임대';
  return false;
}

export function supplyAmountLabel(rental: boolean): string {
  return rental ? '공급금액' : '분양가';
}
