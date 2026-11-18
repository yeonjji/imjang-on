/**
 * 청약홈 원자료(LTTOT_TOP_AMOUNT, 만원) 오기 보정표. 2026-11-18 조사
 * (docs/superpowers/specs/2026-11-03-subscription-detail-enrichment-feasibility.md).
 *
 * 원칙: **공고문 원문으로 확인한 값만** 보정한다. "10배 차이면 10으로 나누기" 같은 규칙은 쓰지 않는다.
 * 원문을 못 구한 의심 건은 금액은 원자료대로 두고, 그 값으로 계산하는 3.3㎡당만 내지 않는다.
 *
 * 수집 어댑터(normalizeUnit)가 이 표를 적용해 SubscriptionUnit.topAmount에 보정값을 넣는다(rawJson은 원본 유지).
 * 이미 적재된 행은 scripts/ops/apply-subscription-amount-corrections.ts로 한 번 맞춘다.
 */
export interface AmountCorrection {
  houseManageNo: string;
  houseType: string;
  /** 청약홈 원자료 값(만원 칸) */
  sourceAmount: number;
  /** 공고문 기준 보정값(만원) */
  amount: number;
  evidence: string;
}

export const AMOUNT_CORRECTIONS: readonly AmountCorrection[] = [
  {
    // 성남복정1 A2블록 신혼희망타운(공공분양) 잔여세대, 2025-05-30 공고
    houseManageNo: '2025820009',
    houseType: '055.9700B',
    sourceAmount: 693790,
    amount: 69379,
    evidence: '입주자모집공고문 "[단위: 천원] 55B 207-1503 기본형 693,790" — 천원 단위 금액이 만원 칸에 기재됨',
  },
];

/**
 * 원자료가 틀린 것으로 보이지만 공고문 원문으로 확인하지 못한 공고(houseManageNo).
 * 금액은 그대로 두고 3.3㎡당만 생략한다.
 * - 2025820006 의왕월암 A-3 신혼희망타운 55S 461,940만원(46억) — 같은 천원 오기 의심, LH 공고문 미확보
 * - 2022820009 수서역세권 A3 신혼희망타운 46B 4,795·55B 5,712만원 — 2019 최초공고 보도는 4.55~5.71억
 */
export const UNVERIFIED_AMOUNT_SUSPECTS: ReadonlySet<string> = new Set(['2025820006', '2022820009']);

function norm(s: unknown): string {
  return String(s ?? '').trim();
}

export function findAmountCorrection(houseManageNo: unknown, houseType: unknown): AmountCorrection | null {
  const h = norm(houseManageNo);
  const t = norm(houseType);
  return AMOUNT_CORRECTIONS.find((c) => c.houseManageNo === h && c.houseType === t) ?? null;
}

/** 원자료 값이 보정표의 원값과 같을 때만 보정한다 — 청약홈이 나중에 바로잡으면 보정이 저절로 꺼진다. */
export function correctedTopAmount(
  houseManageNo: unknown,
  houseType: unknown,
  sourceAmount: number | null,
): number | null {
  const c = findAmountCorrection(houseManageNo, houseType);
  return c && sourceAmount === c.sourceAmount ? c.amount : sourceAmount;
}
