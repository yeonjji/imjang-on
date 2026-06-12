import {
  parseXml,
  getItems,
  getTotalCount,
  parseCommaNumber,
  assertNormalResponse,
} from '@/scripts/ingest/xml-parse';
import { toTags, emptyToNull } from './normalize';
import type { LoanProductRow } from './types';

// 대출상품 응답(XML 한 페이지) → 행 + totalCount.
export function parseLoanProducts(xml: string): { rows: LoanProductRow[]; totalCount: number } {
  const parsed = parseXml(xml);
  assertNormalResponse(parsed); // resultCode !== 00 이면 throw
  const totalCount = getTotalCount(parsed);
  const items = getItems(parsed);

  const rows: LoanProductRow[] = items.map((raw) => {
    const it = raw as Record<string, unknown>;
    return {
      seq: Number(it.seq),
      finprdnm: String(it.finprdnm ?? ''),
      ofrinstnm: emptyToNull(it.ofrinstnm),
      instCtg: emptyToNull(it.instCtg),
      lnlmt: parseCommaNumber(it.lnlmt as string | number | null | undefined),
      irt: emptyToNull(it.irt),
      irtCtg: emptyToNull(it.irtCtg),
      usageTags: toTags(it.usge),
      targetTags: toTags(it.trgt),
      regionTags: toTags(it.rsdAreaPamtEqltIstm),
      rawJson: it,
    };
  });
  return { rows, totalCount };
}
