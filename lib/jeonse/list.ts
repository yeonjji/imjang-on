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

/** 데이터 스냅샷 기준일(가장 최근 갱신 시각). 미적재 시 null. */
export async function getJeonseDataAsOf(): Promise<Date | null> {
  const row = await prisma.jeonseGuaranteeProduct.findFirst({
    select: { updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return row?.updatedAt ?? null;
}

/** 전 지역한도 행(작은 표 ~321행 → finder에 통째 전달해 인메모리 매칭). */
export async function getRegionLimits(): Promise<RegionLimitLite[]> {
  return prisma.jeonseRegionLimit.findMany({
    select: { grntDvcd: true, trgtLwdgCd: true, maxRentGrntAmt: true },
  });
}
