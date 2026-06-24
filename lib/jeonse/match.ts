/**
 * 전세자금보증 조건매칭(A2) — 순수 함수. 런타임 외부호출 없이 적재 스냅샷으로 매칭한다.
 * 정확한 원 단위 한도는 HF가 소득·부채로 실시간 계산(op1)하므로 재현 불가 →
 * 여기서는 "상품 기준 상한 + 지역 가능여부 + 대상 적합"까지만 산출(안내용).
 */
export interface JeonseProductLite {
  grntDvcd: string;
  rcmdProdNm: string;
  rcmdGrntProdDvcd: string | null;
  grntReqTrgtDvcd: string | null;
  exptGrfeRateCont: string | null;
  rentGrntMaxLoanLmtRate: number | null;
  maxLoanLmtAmt: number | null;
}

export interface RegionLimitLite {
  grntDvcd: string;
  trgtLwdgCd: string;
  maxRentGrntAmt: number;
}

export interface JeonseCriteria {
  lawdCd: string; // 사용자 선택 법정동코드(시군구, 10자리)
  depositAmount: number; // 임차보증금(원)
  target?: 'all' | 'youth' | 'newlywed'; // 대상 좁히기(옵션)
}

export interface JeonseMatch {
  product: JeonseProductLite;
  regionMaxDeposit: number; // 해당 지역 최대임차보증금
  depositWithinLimit: boolean; // 사용자 보증금이 지역 한도 이내인가
  estMaxLoanAmt: number | null; // 한도 상한(추정, 안내용)
}

/** 법정동코드에서 trailing 0 제거 → 유효 접두어(시도/시군구 수준). 예 1100000000→'11', 4615000000→'4615'. */
export function regionPrefix(lawdCd: string): string {
  return lawdCd.replace(/0+$/, '');
}

/** region row가 사용자 법정동코드에 적용되는가(접두 매칭). */
export function regionApplies(rowCode: string, userLawdCd: string): boolean {
  const p = regionPrefix(rowCode);
  return p.length > 0 && userLawdCd.startsWith(p);
}

/** 대상구분이 사용자가 고른 target과 호환되는가. 00(전체)·null은 항상 OK. */
export function targetMatches(grntReqTrgtDvcd: string | null, target: JeonseCriteria['target']): boolean {
  if (!target || target === 'all') return true;
  if (grntReqTrgtDvcd === '00' || grntReqTrgtDvcd == null) return true;
  if (target === 'youth') return grntReqTrgtDvcd === '01';
  if (target === 'newlywed') return grntReqTrgtDvcd === '02';
  return true;
}

/** 한도 상한(추정) = min(보증금 × 한도비율%, 상품 최대한도). 비율 없으면 상품 최대한도. */
export function estimateLoanCap(deposit: number, p: JeonseProductLite): number | null {
  const byRatio = p.rentGrntMaxLoanLmtRate != null ? Math.floor((deposit * p.rentGrntMaxLoanLmtRate) / 100) : null;
  const cap = p.maxLoanLmtAmt ?? null;
  if (byRatio != null && cap != null) return Math.min(byRatio, cap);
  return byRatio ?? cap;
}

/** 해당 상품(grntDvcd)의 region row 중 사용자 지역에 적용되는 가장 구체적인(접두어 긴) 것. 없으면 null. */
export function regionRowFor(
  regions: RegionLimitLite[],
  grntDvcd: string,
  lawdCd: string,
): RegionLimitLite | null {
  let best: RegionLimitLite | null = null;
  let bestLen = -1;
  for (const r of regions) {
    if (r.grntDvcd !== grntDvcd) continue;
    if (!regionApplies(r.trgtLwdgCd, lawdCd)) continue;
    const len = regionPrefix(r.trgtLwdgCd).length;
    if (len > bestLen) {
      best = r;
      bestLen = len;
    }
  }
  return best;
}

export function matchGuarantees(
  criteria: JeonseCriteria,
  products: JeonseProductLite[],
  regions: RegionLimitLite[],
): JeonseMatch[] {
  const out: JeonseMatch[] = [];
  for (const product of products) {
    if (!targetMatches(product.grntReqTrgtDvcd, criteria.target)) continue;
    const row = regionRowFor(regions, product.grntDvcd, criteria.lawdCd);
    if (!row) continue; // 해당 지역 미제공 상품
    out.push({
      product,
      regionMaxDeposit: row.maxRentGrntAmt,
      depositWithinLimit: criteria.depositAmount <= row.maxRentGrntAmt,
      estMaxLoanAmt: estimateLoanCap(criteria.depositAmount, product),
    });
  }

  // 보증금 한도 내 상품 우선, 그다음 한도 상한 큰 순.
  out.sort(
    (a, b) =>
      Number(b.depositWithinLimit) - Number(a.depositWithinLimit) || (b.estMaxLoanAmt ?? 0) - (a.estMaxLoanAmt ?? 0),
  );
  return out;
}
