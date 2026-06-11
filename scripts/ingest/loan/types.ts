// 정규화된 대출상품 1행 (DB LoanProduct 와 1:1)
export interface LoanProductRow {
  seq: number;
  finprdnm: string;
  ofrinstnm: string | null;
  instCtg: string | null;
  lnlmt: number | null;
  irt: string | null;
  irtCtg: string | null;
  usageTags: string[];
  targetTags: string[];
  regionTags: string[];
  rawJson: Record<string, unknown>;
}

export const LOAN_INGEST_SOURCE = 'kinfa-loan';
