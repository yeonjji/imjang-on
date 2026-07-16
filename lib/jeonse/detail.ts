import { prisma } from '@/lib/db';
import type { JeonseGuaranteeProduct, JeonseRegionLimit } from '@prisma/client';

export async function getJeonseProduct(grntDvcd: string): Promise<JeonseGuaranteeProduct | null> {
  return prisma.jeonseGuaranteeProduct.findUnique({ where: { grntDvcd } });
}

/** 해당 상품의 지역별 최대임차보증금(시도순). */
export async function getProductRegions(grntDvcd: string): Promise<JeonseRegionLimit[]> {
  return prisma.jeonseRegionLimit.findMany({ where: { grntDvcd }, orderBy: { trgtLwdgCd: 'asc' } });
}
