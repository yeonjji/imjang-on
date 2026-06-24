import { prisma } from '@/lib/db';
import type { JeonseProductLite, RegionLimitLite } from './match';

/** 공개 finder용 상품 요약(매칭에 필요한 필드만). */
export async function getJeonseProducts(): Promise<JeonseProductLite[]> {
  return prisma.jeonseGuaranteeProduct.findMany({
    select: {
      grntDvcd: true,
      rcmdProdNm: true,
      rcmdGrntProdDvcd: true,
      grntReqTrgtDvcd: true,
      exptGrfeRateCont: true,
      rentGrntMaxLoanLmtRate: true,
      maxLoanLmtAmt: true,
    },
    orderBy: { rcmdProdNm: 'asc' },
  });
}

/** 전 지역한도 행(작은 표 ~321행 → finder에 통째 전달해 인메모리 매칭). */
export async function getRegionLimits(): Promise<RegionLimitLite[]> {
  return prisma.jeonseRegionLimit.findMany({
    select: { grntDvcd: true, trgtLwdgCd: true, maxRentGrntAmt: true },
  });
}
