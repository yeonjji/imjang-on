import { GRNT_DVCD_LABELS } from './codes';
import type { JeonseProductRow, JeonseRegionRow } from './types';

interface ApiHeader {
  resultCode?: string;
  resultMsg?: string;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** resultCode가 00이 아니면 throw(잡 실패). 00 + 데이터 없음(NODATA)은 정상으로 본다. */
function assertOk(header: ApiHeader | undefined, ctx: string): void {
  const code = header?.resultCode;
  if (code && code !== '00') {
    throw new Error(`jeonse ${ctx}: resultCode ${code} ${header?.resultMsg ?? ''}`);
  }
}

/** op3 상세 응답 → 상품 행. 항목 없으면 null(NODATA = 폐지/미제공 코드). */
export function parseProductDetail(json: unknown, grntDvcd: string): JeonseProductRow | null {
  const j = json as { header?: ApiHeader; body?: { item?: Record<string, unknown> } };
  assertOk(j?.header, `detail ${grntDvcd}`);
  const item = j?.body?.item;
  if (!item || !str(item.grntDvcd)) return null;

  return {
    grntDvcd: String(item.grntDvcd),
    rcmdProdNm: str(item.rcmdProdNm) ?? GRNT_DVCD_LABELS[grntDvcd] ?? grntDvcd,
    rcmdGrntProdDvcd: str(item.rcmdGrntProdDvcd),
    grntReqTrgtDvcd: str(item.grntReqTrgtDvcd),
    reqTrgtCont: str(item.reqTrgtCont),
    exptGrfeRateCont: str(item.exptGrfeRateCont),
    intSprtCont: str(item.intSprtCont),
    grntPrmeCont: str(item.grntPrmeCont),
    rentGrntMaxLoanLmtRate: num(item.rentGrntMaxLoanLmtRate),
    maxLoanLmtAmt: num(item.maxLoanLmtAmt),
    trtBankCont: str(item.trtBankCont),
    guidUrl: str(item.guidUrl),
    rawJson: item,
  };
}

/** op4 지역별 한도 응답 → 지역 행 목록. items는 배열/단건/없음 모두 대응. */
export function parseRegionLimits(json: unknown, grntDvcd: string): JeonseRegionRow[] {
  const j = json as { header?: ApiHeader; body?: { items?: unknown } };
  assertOk(j?.header, `region ${grntDvcd}`);
  const raw = j?.body?.items;
  const arr: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : raw
      ? [raw as Record<string, unknown>]
      : [];

  const rows: JeonseRegionRow[] = [];
  for (const it of arr) {
    const code = str(it.trgtLwdgCd);
    const amt = num(it.maxRentGrntAmt);
    if (code === null || amt === null) continue;
    rows.push({ grntDvcd, trgtLwdgCd: code, maxRentGrntAmt: amt });
  }
  return rows;
}
