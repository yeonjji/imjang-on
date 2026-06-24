import { prisma } from '@/lib/db';
import type { JeonseGuaranteeProduct, JeonseRegionLimit } from '@prisma/client';

/** 상세 정적 파라미터용 전 보증구분코드. DB 미적용 시 빈 배열로 폴백(빌드 안 깨뜨림). */
export async function getAllGrntDvcds(): Promise<string[]> {
  try {
    const rows = await prisma.jeonseGuaranteeProduct.findMany({ select: { grntDvcd: true } });
    return rows.map((r) => r.grntDvcd);
  } catch {
    return [];
  }
}

export async function getJeonseProduct(grntDvcd: string): Promise<JeonseGuaranteeProduct | null> {
  return prisma.jeonseGuaranteeProduct.findUnique({ where: { grntDvcd } });
}

/** 해당 상품의 지역별 최대임차보증금(시도순). */
export async function getProductRegions(grntDvcd: string): Promise<JeonseRegionLimit[]> {
  return prisma.jeonseRegionLimit.findMany({ where: { grntDvcd }, orderBy: { trgtLwdgCd: 'asc' } });
}
