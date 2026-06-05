import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { logger } from '@/lib/logger';
import { fetchLh } from './http';
import { parseFlexibleDate, parseScheduleRange } from './dates';
import type { NormalizedNotice, NoticeWithUnits } from './types';

const LIST_PATH = 'lhLeaseNoticeBfhInfo1';
const LIST_OP = 'lhLeaseNoticeBfhInfo1';
const DETAIL_PATH = 'lhLeaseNoticeBfhDtlInfo1';
const DETAIL_OP = 'getLeaseNoticeBfhDtlInfo1';
const SERVICE_START = '20231019';

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

function pickDataset(resp: any, key: string): any[] {
  if (!Array.isArray(resp)) return [];
  for (const block of resp) {
    if (block && Array.isArray(block[key])) return block[key];
  }
  return [];
}

export function parseLhList(resp: any): Record<string, any>[] {
  return pickDataset(resp, 'dsList');
}

export function normalizeLhNotice(row: Record<string, any>): NormalizedNotice {
  const panId = str(row.PAN_ID);
  return {
    source: SubscriptionSource.LH_PRESUB,
    category: SubscriptionCategory.LH_PRESUB,
    sourceKey: panId ?? '(unknown)',
    houseManageNo: null,
    pblancNo: null,
    panId,
    origNoticeKey: str(row.OTXT_PAN_ID),
    name: str(row.PAN_NM) ?? '(무명)',
    status: str(row.PAN_SS),
    regionCode: str(row.CNP_CD),
    regionName: str(row.CNP_CD_NM),
    address: null,
    totalSupply: null,
    noticeDate: parseFlexibleDate(str(row.PAN_NT_ST_DT)),
    receiptBegin: null,
    receiptEnd: parseFlexibleDate(str(row.CLSG_DT)),
    winnerDate: null,
    contractBegin: null,
    contractEnd: null,
    moveInYm: null,
    homepage: null,
    noticeUrl: str(row.DTL_URL),
    developer: null,
    constructor: null,
    tel: null,
    lat: null,
    lng: null,
    rawJson: { list: row },
  };
}

export function applyLhDetail(notice: NormalizedNotice, detailResp: any): NormalizedNotice {
  const schedules = pickDataset(detailResp, 'dsSplScdl');
  let receiptBegin: Date | null = null;
  let winnerDate: Date | null = null;
  for (const s of schedules) {
    const { begin } = parseScheduleRange(str(s.ACP_DTTM));
    if (begin && (!receiptBegin || begin < receiptBegin)) receiptBegin = begin;
    const w = parseFlexibleDate(str(s.PZWR_ANC_DT));
    if (w && (!winnerDate || w > winnerDate)) winnerDate = w;
  }
  return {
    ...notice,
    receiptBegin: receiptBegin ?? notice.receiptBegin,
    winnerDate: winnerDate ?? notice.winnerDate,
    rawJson: { ...(notice.rawJson as object), detail: detailResp },
  };
}

export async function fetchLhPresub(): Promise<NoticeWithUnits[]> {
  const today = new Date();
  const end = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;
  const out: NoticeWithUnits[] = [];
  const PG = 100;
  let page = 1;
  while (true) {
    const resp = await fetchLh(LIST_PATH, LIST_OP, {
      PG_SZ: PG,
      PAGE: page,
      PAN_ST_DT: SERVICE_START,
      PAN_ED_DT: end,
    });
    const rows = parseLhList(resp);
    const total = Number(rows[0]?.TOTALCOUNT ?? rows.length);
    for (const row of rows) {
      let notice = normalizeLhNotice(row);
      try {
        if (notice.panId) {
          const detail = await fetchLh(DETAIL_PATH, DETAIL_OP, { PAN_ID: notice.panId });
          notice = applyLhDetail(notice, detail);
        }
      } catch (err) {
        logger.warn({ err, panId: notice.panId }, 'LH detail fetch failed — list only');
      }
      out.push({ notice, units: [] });
    }
    logger.info({ page, fetched: out.length, total }, 'LH list page');
    if (page * PG >= total || rows.length === 0) break;
    page++;
  }
  return out;
}
