export const JEONSE_INGEST_SOURCE = 'jeonse-guarantee';

/** op3 상세정보 → JeonseGuaranteeProduct 행. */
export interface JeonseProductRow {
  grntDvcd: string;
  rcmdProdNm: string;
  rcmdGrntProdDvcd: string | null;
  grntReqTrgtDvcd: string | null;
  reqTrgtCont: string | null;
  exptGrfeRateCont: string | null;
  intSprtCont: string | null;
  grntPrmeCont: string | null;
  rentGrntMaxLoanLmtRate: number | null;
  maxLoanLmtAmt: number | null;
  trtBankCont: string | null;
  guidUrl: string | null;
  rawJson: unknown;
}

/** op4 지역별 최대임차보증금 → JeonseRegionLimit 행. */
export interface JeonseRegionRow {
  grntDvcd: string;
  trgtLwdgCd: string;
  maxRentGrntAmt: number;
}
