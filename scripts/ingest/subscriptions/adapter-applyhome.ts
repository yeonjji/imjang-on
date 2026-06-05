import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { logger } from '@/lib/logger';
import { fetchOdcloud } from './http';
import { parseFlexibleDate } from './dates';
import type { NormalizedNotice, NormalizedUnit, NoticeWithUnits } from './types';

export interface ApplyhomeCategoryConfig {
  category: SubscriptionCategory;
  detailOp: string;
  mdlOp: string;
}

export const APPLYHOME_CONFIG = {
  apt: { category: SubscriptionCategory.APT, detailOp: 'getAPTLttotPblancDetail', mdlOp: 'getAPTLttotPblancMdl' },
  urbty: { category: SubscriptionCategory.OFFICETEL_ETC, detailOp: 'getUrbtyOfctlLttotPblancDetail', mdlOp: 'getUrbtyOfctlLttotPblancMdl' },
  remndr: { category: SubscriptionCategory.REMNANT, detailOp: 'getRemndrLttotPblancDetail', mdlOp: 'getRemndrLttotPblancMdl' },
  pblpvt: { category: SubscriptionCategory.PUB_PRIV_RENT, detailOp: 'getPblPvtRentLttotPblancDetail', mdlOp: 'getPblPvtRentLttotPblancMdl' },
  opt: { category: SubscriptionCategory.ARBITRARY, detailOp: 'getOPTLttotPblancDetail', mdlOp: 'getOPTLttotPblancMdl' },
} satisfies Record<string, ApplyhomeCategoryConfig>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeNotice(
  row: Record<string, unknown>,
  cfg: ApplyhomeCategoryConfig,
): NormalizedNotice {
  const houseManageNo = str(row.HOUSE_MANAGE_NO);
  const pblancNo = str(row.PBLANC_NO);
  return {
    source: SubscriptionSource.APPLYHOME,
    category: cfg.category,
    sourceKey: `${houseManageNo}-${pblancNo}`,
    houseManageNo,
    pblancNo,
    panId: null,
    origNoticeKey: null,
    name: str(row.HOUSE_NM) ?? '(무명)',
    status: null,
    regionCode: str(row.SUBSCRPT_AREA_CODE),
    regionName: str(row.SUBSCRPT_AREA_CODE_NM),
    address: str(row.HSSPLY_ADRES),
    totalSupply: num(row.TOT_SUPLY_HSHLDCO),
    noticeDate: parseFlexibleDate(str(row.RCRIT_PBLANC_DE)),
    receiptBegin: parseFlexibleDate(str(row.RCEPT_BGNDE) ?? str(row.SUBSCRPT_RCEPT_BGNDE)),
    receiptEnd: parseFlexibleDate(str(row.RCEPT_ENDDE) ?? str(row.SUBSCRPT_RCEPT_ENDDE)),
    winnerDate: parseFlexibleDate(str(row.PRZWNER_PRESNATN_DE)),
    contractBegin: parseFlexibleDate(str(row.CNTRCT_CNCLS_BGNDE)),
    contractEnd: parseFlexibleDate(str(row.CNTRCT_CNCLS_ENDDE)),
    moveInYm: str(row.MVN_PREARNGE_YM),
    homepage: str(row.HMPG_ADRES),
    noticeUrl: str(row.PBLANC_URL),
    developer: str(row.BSNS_MBY_NM),
    constructor: str(row.CNSTRCT_ENTRPS_NM),
    tel: str(row.MDHS_TELNO),
    lat: null,
    lng: null,
    rawJson: row,
  };
}

export function normalizeUnit(row: Record<string, unknown>): NormalizedUnit {
  return {
    modelNo: str(row.MODEL_NO),
    houseType: str(row.HOUSE_TY) ?? str(row.TP),
    area: num(row.SUPLY_AR) ?? num(row.EXCLUSE_AR),
    generalSupply: num(row.SUPLY_HSHLDCO),
    specialSupply: num(row.SPSPLY_HSHLDCO),
    topAmount: num(row.LTTOT_TOP_AMOUNT) ?? num(row.SUPLY_AMOUNT),
    rawJson: row,
  };
}

export async function fetchApplyhomeCategory(
  cfg: ApplyhomeCategoryConfig,
): Promise<NoticeWithUnits[]> {
  const out: NoticeWithUnits[] = [];
  const PER = 100;
  let page = 1;
  while (true) {
    const { data, totalCount } = await fetchOdcloud(cfg.detailOp, { page, perPage: PER });
    for (const row of data) {
      const notice = normalizeNotice(row as Record<string, unknown>, cfg);
      const units = await fetchUnits(cfg, notice.houseManageNo, notice.pblancNo);
      out.push({ notice, units });
    }
    logger.info({ category: cfg.category, page, fetched: out.length, totalCount }, 'applyhome page');
    if (page * PER >= totalCount || data.length === 0) break;
    page++;
  }
  return out;
}

async function fetchUnits(
  cfg: ApplyhomeCategoryConfig,
  houseManageNo: string | null,
  pblancNo: string | null,
): Promise<NormalizedUnit[]> {
  if (!houseManageNo || !pblancNo) return [];
  const units: NormalizedUnit[] = [];
  let page = 1;
  while (true) {
    const { data, totalCount } = await fetchOdcloud(cfg.mdlOp, {
      page,
      perPage: 100,
      'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo,
      'cond[PBLANC_NO::EQ]': pblancNo,
    });
    for (const row of data) units.push(normalizeUnit(row as Record<string, unknown>));
    if (page * 100 >= totalCount || data.length === 0) break;
    page++;
  }
  return units;
}
